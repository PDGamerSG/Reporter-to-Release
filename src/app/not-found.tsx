import Link from "next/link";
import { PublicHeader } from "@/components/public-header";
export default function NotFound() { return <div className="public-shell"><PublicHeader /><main id="main" className="public-content"><div className="public-intro"><h1>This page took a wrong turn.</h1><p>The link may have changed. Your reports are still in the bug desk.</p></div><div className="button-row" style={{ justifyContent: "center" }}><Link className="button primary" href="/">Open the bug desk</Link><Link className="button secondary" href="/report">Report a bug</Link></div></main></div>; }
