import { BugDesk } from "@/components/bug-desk";
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{
    title?: string;
    description?: string;
    mode?: string;
  }>;
}) {
  const { title, description, mode } = await searchParams;
  const text = [title, description].filter(Boolean).join(". ").slice(0, 6000);
  return <BugDesk demo={mode === "demo"} initialText={text} />;
}
