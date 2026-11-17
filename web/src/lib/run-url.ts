/* Keep the run id in the address bar so a reload resumes the run. */

export function rememberRun(id: string | null): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (id) url.searchParams.set("run", id);
  else url.searchParams.delete("run");
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}
