import AppShell from "@/components/(shell)/AppShell";

export default async function ({ children }: { children: React.ReactNode }) {
    return <AppShell>{children}</AppShell>;
}
