import { redirect } from "next/navigation";
import { Desk } from "@/components/desk";
import { isAuthed } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Page() {
  if (!(await isAuthed())) redirect("/login");
  return <Desk />;
}
