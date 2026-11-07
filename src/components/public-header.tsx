import Link from "next/link";
import { ArrowUpRight, GitBranch } from "lucide-react";
export function PublicHeader() { return <header className="public-header"><Link className="public-brand" href="/"><span className="brand-mark"><GitBranch size={18} /></span>Reporter-to-Release</Link><nav><Link href="/report">Report a bug</Link><Link href="/">Open bug desk<ArrowUpRight size={11} /></Link></nav></header>; }
