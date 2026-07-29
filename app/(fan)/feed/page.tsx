import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import AppHeader from "@/components/AppHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

export default async function FeedPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user!.id)
    .maybeSingle();

  const { data: creators } = await supabase
    .from("creators")
    .select("id, handle, bio, monthly_price_cents")
    .eq("active", true);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-8">
      <AppHeader
        title={`Hola, ${profile?.display_name ?? "fan"}`}
        subtitle="Creadoras disponibles en el sandbox"
      />

      <section className="flex flex-col gap-3">
        {creators && creators.length > 0 ? (
          creators.map((creator) => (
            <Link key={creator.id} href={`/creator/${creator.id}`}>
              <Card className="transition-colors hover:bg-accent/40">
                <CardContent className="flex items-center gap-4">
                  <Avatar className="size-11">
                    <AvatarFallback className="bg-primary/15 text-primary">
                      {creator.handle.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <p className="font-medium">@{creator.handle}</p>
                    <p className="text-sm text-muted-foreground">
                      {creator.bio}
                    </p>
                  </div>
                  <Badge variant="secondary">
                    ${(creator.monthly_price_cents / 100).toFixed(2)}/mes
                  </Badge>
                </CardContent>
              </Card>
            </Link>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">
            Todavía no hay creadoras dadas de alta en el sandbox.
          </p>
        )}
      </section>
    </main>
  );
}
