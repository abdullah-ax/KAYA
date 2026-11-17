import { Boardroom } from "@/components/boardroom/boardroom";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ screen?: string; theme?: string; egg?: string; dev?: string; run?: string }>;
}) {
  const { screen, theme, egg, dev, run } = await searchParams;
  return <Boardroom initialScreen={screen} initialRunId={run} dev={dev === "1"} dark={theme === "dark"} egg={egg !== "0"} />;
}
