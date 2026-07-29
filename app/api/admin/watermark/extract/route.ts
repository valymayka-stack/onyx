import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasRole } from "@/lib/auth/roles";
import { extractInvisibleCode, hammingDistance, TOTAL_CODE_BITS } from "@/lib/watermark/invisible";

// How close a recovered code must be to a known issued code to count as a
// match — tuned empirically (scripts/test-invisible-watermark.mjs): exact
// matches through ~20% crop, 1 bit off in a 30%-crop stress test. 4 bits out
// of 24 (~83% agreement) accepts that kind of real-world degradation while
// staying far from the ~12/24 average distance an unrelated image produces.
const MATCH_THRESHOLD_BITS = 4;

export async function POST(request: NextRequest) {
  const sessionClient = await createClient();
  const {
    data: { user },
  } = await sessionClient.auth.getUser();

  if (!user || !(await hasRole(sessionClient, user.id, "admin"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("image");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "missing image" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let recovered;
  try {
    recovered = await extractInvisibleCode(buffer);
  } catch {
    return NextResponse.json({ error: "could not read image" }, { status: 400 });
  }

  interface DeliveryMark {
    code: string;
    item_id: string;
    user_id: string;
    session_id: string;
    created_at: string;
  }

  const admin = createAdminClient();
  const { data: marks } = await admin
    .from("content_delivery_marks")
    .select("code, item_id, user_id, session_id, created_at");

  let nearestDistance = Infinity;
  let nearestMark: DeliveryMark | null = null;
  for (const mark of (marks ?? []) as DeliveryMark[]) {
    const distance = hammingDistance(recovered.code, mark.code);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestMark = mark;
    }
  }

  if (!nearestMark || nearestDistance > MATCH_THRESHOLD_BITS) {
    return NextResponse.json({
      match: null,
      recoveredCode: recovered.code,
      confidence: recovered.confidence,
      closestDistance: nearestMark ? nearestDistance : null,
      totalBits: TOTAL_CODE_BITS,
    });
  }

  const [{ data: profile }, { data: contentItem }] = await Promise.all([
    admin
      .from("profiles")
      .select("display_name, banned_at")
      .eq("id", nearestMark.user_id)
      .maybeSingle(),
    admin
      .from("content_items")
      .select("storage_path, creators(handle)")
      .eq("id", nearestMark.item_id)
      .maybeSingle(),
  ]);

  const creatorHandle =
    (contentItem?.creators as unknown as { handle: string }[] | { handle: string } | null) instanceof Array
      ? (contentItem?.creators as unknown as { handle: string }[])[0]?.handle
      : (contentItem?.creators as unknown as { handle: string } | null)?.handle;

  return NextResponse.json({
    match: {
      userId: nearestMark.user_id,
      displayName: profile?.display_name ?? null,
      bannedAt: profile?.banned_at ?? null,
      sessionId: nearestMark.session_id,
      deliveredAt: nearestMark.created_at,
      itemFilename: contentItem?.storage_path?.split("/").pop() ?? null,
      creatorHandle: creatorHandle ?? null,
      distance: nearestDistance,
    },
    recoveredCode: recovered.code,
    confidence: recovered.confidence,
    totalBits: TOTAL_CODE_BITS,
  });
}
