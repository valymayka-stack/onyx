import AppHeader from "@/components/AppHeader";
import AdminNav from "@/components/AdminNav";
import AdminAccessManager from "@/components/admin/AdminAccessManager";

export default function AdminAccessPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-8">
      <AppHeader title="Accesos" subtitle="Gestiona el acceso de un usuario a colecciones privadas" />
      <AdminNav />
      <AdminAccessManager />
    </main>
  );
}
