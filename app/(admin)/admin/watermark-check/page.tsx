import AppHeader from "@/components/AppHeader";
import AdminNav from "@/components/AdminNav";
import WatermarkCheckForm from "@/components/admin/WatermarkCheckForm";

export default function WatermarkCheckPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-8">
      <AppHeader
        title="Verificar marca"
        subtitle="Rastrea una imagen sospechosa hasta la entrega que la originó"
      />
      <AdminNav />
      <WatermarkCheckForm />
    </main>
  );
}
