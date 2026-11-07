import { Tracker } from "@/components/tracker";
export const metadata = { title: "Your bug report", robots: { index: false, follow: false } };
export default async function TrackingPage({ params }: { params: Promise<{ id: string }> }) { return <Tracker reportId={(await params).id} />; }
