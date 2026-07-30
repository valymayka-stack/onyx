import AppHeader from "@/components/AppHeader";
import AdminNav from "@/components/AdminNav";
import CreateCreatorForm from "@/components/admin/CreateCreatorForm";

export default function AdminCreateCreatorPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-8">
      <AppHeader title="Crear creadora" subtitle="No hay registro público — las cuentas se crean aquí" />
      <AdminNav />
      <CreateCreatorForm />
    </main>
  );
}
