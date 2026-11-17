"use client";

/* "Put your page online": publish the sign-up page the founder approved to the
   founder's own free Netlify account. The token lives in this component's
   memory only. It is sent in the X-Netlify-Token header and never stored. */

import { ExternalLink, Loader2, TriangleAlert } from "lucide-react";
import { useEffect, useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { ApiError, publishToNetlify, takeDownNetlify, type Run } from "@/lib/api";

const TOKEN_PAGE = "https://app.netlify.com/user/applications#personal-access-tokens";
const FALLBACK = "Couldn't reach the API. Check your connection and try again.";

type Busy = "publish" | "takedown" | null;

export function PublishCard({ run, connected = true }: { run: Run; connected?: boolean }) {
  const approved = run.delivery?.approved ?? false;
  const [url, setUrl] = useState<string | null>(run.delivery?.url ?? null);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const tokenId = useId();
  const serverUrl = run.delivery?.url ?? null;

  useEffect(() => { if (serverUrl) setUrl(serverUrl); }, [serverUrl]);

  const go = async (kind: Exclude<Busy, null>) => {
    setBusy(kind);
    setError(null);
    try {
      if (kind === "publish") {
        const done = await publishToNetlify(run.id, token.trim());
        setUrl(done.url);
        setOffline(false);
        setToken("");
      } else {
        await takeDownNetlify(run.id, token.trim());
        setUrl(null);
        setOffline(true);
        setToken("");
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : FALLBACK);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="flex flex-col gap-3" aria-labelledby={`${tokenId}-h`}>
      <h3 id={`${tokenId}-h`} className="text-[14px] font-bold tracking-wide text-muted-foreground uppercase">Put your page online</h3>
      {!connected && (
        <p className="text-[14px] font-bold text-amber-800 dark:text-amber-300">STUBBED: demo mode. Check the live link yourself before you share it.</p>
      )}

      {!approved && !url ? (
        <p className="text-base">Publishing waits for your decision. Approve the sign-up page at the gate first. Nothing goes online before that.</p>
      ) : (
        <>
          <p className="text-base">
            {url
              ? "Your page is online, on your own free Netlify account."
              : "Publish the page you approved to your own free Netlify account. You own it and can take it down at any time."}
          </p>

          {url && (
            <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex w-fit items-center gap-1.5 break-all font-mono text-[15px] font-bold underline underline-offset-4">
              {url}
              <ExternalLink className="size-4 shrink-0" aria-hidden />
            </a>
          )}
          {offline && !url && <p role="status" className="text-[15px] font-semibold">Your page is offline.</p>}

          {!url && (
            <>
              <a href={TOKEN_PAGE} target="_blank" rel="noopener noreferrer" className="inline-flex w-fit items-center gap-1.5 text-base font-bold underline underline-offset-4">
                Get a free Netlify token (2 minutes)
                <ExternalLink className="size-4 shrink-0" aria-hidden />
              </a>
              <ol className="ml-5 list-decimal text-[15px]">
                <li>Sign up or log in at netlify.com. It is free.</li>
                <li>Open the page above and press New access token.</li>
                <li>Copy the token and paste it below.</li>
              </ol>
            </>
          )}

          <label htmlFor={tokenId} className="text-[15px] font-bold">Netlify token</label>
          <input
            id={tokenId}
            type="password"
            autoComplete="off"
            value={token}
            disabled={busy !== null}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Paste your token"
            className="h-11 rounded-lg border-2 bg-card px-3 font-mono text-base outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40"
          />
          <p className="text-[14px] text-muted-foreground">Kept in this browser tab only. Never saved, never logged.</p>

          {error && (
            <p role="alert" className="flex items-start gap-2 text-[15px] font-semibold text-destructive">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> {error}
            </p>
          )}

          {url ? (
            <Button variant="outline" onClick={() => go("takedown")} disabled={busy !== null || !token.trim()} className="w-fit rounded-full">
              {busy === "takedown" && <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden />}
              {busy === "takedown" ? "Taking it down" : "Take it down"}
            </Button>
          ) : (
            <Button onClick={() => go("publish")} disabled={busy !== null || !token.trim()} className="w-fit rounded-full">
              {busy === "publish" && <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden />}
              {busy === "publish" ? "Publishing" : error ? "Try again" : "Publish to Netlify"}
            </Button>
          )}
        </>
      )}
    </section>
  );
}
