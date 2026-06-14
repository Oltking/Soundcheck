import { redirect } from "next/navigation";

export default async function RunIndex({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/run/${id}/stage`);
}
