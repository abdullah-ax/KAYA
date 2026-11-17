import { Boardroom } from "@/components/boardroom/boardroom";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ screen?: string; theme?: string; egg?: string }>;
}) {
  const { screen, theme, egg } = await searchParams;
  return <Boardroom initialScreen={screen} dark={theme === "dark"} egg={egg !== "0"} />;
}
