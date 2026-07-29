import AppHeader from "@/components/AppHeader";
import AdminNav from "@/components/AdminNav";
import CreateFanForm from "@/components/admin/CreateFanForm";

export default function AdminCreateFanPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-8">
      <AppHeader title="Crear fan" subtitle="No hay registro público — las cuentas se crean aquí o desde el bot" />
      <AdminNav />
      <CreateFanForm />
    </main>
  );
}
