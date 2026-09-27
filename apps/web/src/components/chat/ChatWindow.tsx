"use client";

import Link from "next/link";
import { Send, Sparkles, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ApiAbortError, apiFetch } from "@/lib/api";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TicketCard, type TicketCardData } from "./TicketCard";

const SESSION_ID_KEY = "tixly_session_id";
const SESSION_TOKEN_KEY = "tixly_session_token";

type ChatItem = {
  id: string;
  role: "user" | "assistant";
  content: string;
  ticket?: TicketCardData | null;
};

type ChatResponse = {
  status: string;
  reply: string;
  sessionId: string;
  sessionToken?: string;
  ticket?: TicketCardData;
  missingFields?: string[];
};

export function ChatWindow() {
  const [messages, setMessages] = useState<ChatItem[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const pendingRef = useRef<{ tempId: string; content: string } | null>(null);
  const stoppedRef = useRef(false);

  useEffect(() => {
    const sid = localStorage.getItem(SESSION_ID_KEY);
    const tok = localStorage.getItem(SESSION_TOKEN_KEY);
    if (sid && tok) {
      setSessionId(sid);
      setSessionToken(tok);
      apiFetch<{
        messages: {
          id: string;
          role: "user" | "assistant";
          content: string;
          ticket?: TicketCardData;
        }[];
      }>(`/api/chat/sessions/${sid}`, { sessionToken: tok })
        .then((data) => {
          setMessages(
            data.messages.map((m) => ({
              id: m.id,
              role: m.role,
              content: m.content,
              ticket: m.ticket ?? null,
            })),
          );
        })
        .catch(() => {
          localStorage.removeItem(SESSION_ID_KEY);
          localStorage.removeItem(SESSION_TOKEN_KEY);
          setSessionId(null);
          setSessionToken(null);
        });
    }
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  function stopGeneration() {
    stoppedRef.current = true;
    abortRef.current?.abort();
    const pending = pendingRef.current;
    if (pending) {
      setMessages((m) => m.filter((msg) => msg.id !== pending.tempId));
      setInput(pending.content);
      pendingRef.current = null;
    }
    setLoading(false);
    setError(null);
  }

  function newChat() {
    stoppedRef.current = true;
    abortRef.current?.abort();
    pendingRef.current = null;
    localStorage.removeItem(SESSION_ID_KEY);
    localStorage.removeItem(SESSION_TOKEN_KEY);
    setSessionId(null);
    setSessionToken(null);
    setMessages([]);
    setError(null);
    setInput("");
    setLoading(false);
  }

  async function send() {
    const content = input.trim();
    if (!content || loading) return;
    setInput("");
    setError(null);
    const tempId = `local-${Date.now()}`;
    setMessages((m) => [...m, { id: tempId, role: "user", content }]);
    setLoading(true);
    stoppedRef.current = false;
    pendingRef.current = { tempId, content };

    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const res = await apiFetch<ChatResponse>("/api/chat/message", {
        method: "POST",
        sessionToken: sessionToken,
        signal: ac.signal,
        body: JSON.stringify({
          content,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
          ...(sessionId ? { sessionId } : {}),
        }),
      });
      if (stoppedRef.current || ac.signal.aborted) return;
      if (res.sessionToken) {
        localStorage.setItem(SESSION_TOKEN_KEY, res.sessionToken);
        setSessionToken(res.sessionToken);
      }
      localStorage.setItem(SESSION_ID_KEY, res.sessionId);
      setSessionId(res.sessionId);
      setMessages((m) => [
        ...m,
        {
          id: `asst-${Date.now()}`,
          role: "assistant",
          content: res.reply,
          ticket: res.ticket ?? null,
        },
      ]);
      pendingRef.current = null;
    } catch (e) {
      if (
        stoppedRef.current ||
        e instanceof ApiAbortError ||
        (e instanceof Error && e.name === "AbortError")
      ) {
        if (pendingRef.current?.tempId === tempId) {
          setMessages((m) => m.filter((msg) => msg.id !== tempId));
          setInput(content);
          pendingRef.current = null;
        }
        setError(null);
      } else {
        setError(e instanceof Error ? e.message : "Failed to send");
      }
    } finally {
      if (abortRef.current === ac) abortRef.current = null;
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex h-dvh max-w-3xl flex-col px-3 py-3 sm:px-4 sm:py-5">
      <header className="mb-3 flex items-center justify-between gap-3 sm:mb-4">
        <h1 className="font-logo text-4xl leading-none sm:text-5xl">Tixly</h1>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <ThemeToggle />
          <Button variant="outline" size="sm" asChild>
            <Link href="/admin/login">Admin</Link>
          </Button>
          <Button size="sm" onClick={newChat}>
            New Chat
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-card/80 shadow-xl backdrop-blur-sm">
        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-4 px-4 py-5">
            {messages.length === 0 && (
              <div className="rounded-xl border border-dashed border-border bg-muted/40 px-5 py-8 text-center">
                <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-full bg-primary/15 text-primary">
                  <Sparkles className="size-5" />
                </div>
                <p className="text-sm text-muted-foreground">
                  Describe an issue in any language. Tixly extracts a structured
                  ticket and asks follow-ups when something is missing.
                </p>
              </div>
            )}
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div className="max-w-[88%] space-y-2 sm:max-w-[85%]">
                  <div
                    className={`rounded-2xl px-4 py-3 text-[15px] leading-relaxed whitespace-pre-wrap ${
                      m.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "border border-border bg-muted/50 text-foreground"
                    }`}
                  >
                    {m.content}
                  </div>
                  {m.ticket ? <TicketCard ticket={m.ticket} /> : null}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <span className="relative flex size-2">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60" />
                  <span className="relative inline-flex size-2 rounded-full bg-primary" />
                </span>
                Tixly is thinking…
                <button
                  type="button"
                  onClick={stopGeneration}
                  className="text-xs font-medium text-foreground underline-offset-2 hover:underline"
                >
                  Stop
                </button>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </ScrollArea>

        <div className="border-t border-border bg-background/60 p-3 sm:p-4">
          {error && (
            <p className="mb-2 text-sm text-destructive">{error}</p>
          )}
          <form
            className="flex items-center gap-2 rounded-2xl border border-border bg-card p-1.5 shadow-sm"
            onSubmit={(e) => {
              e.preventDefault();
              if (loading) {
                stopGeneration();
                return;
              }
              void send();
            }}
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="e.g. Login crashes on Safari, Rahul by the 4th…"
              className="h-11 flex-1 border-0 bg-transparent shadow-none focus-visible:ring-0"
              disabled={loading}
            />
            {loading ? (
              <Button
                type="button"
                size="icon"
                variant="secondary"
                className="size-11 shrink-0 rounded-xl"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  stopGeneration();
                }}
                aria-label="Stop generation"
              >
                <Square className="size-3.5 fill-current" />
              </Button>
            ) : (
              <Button
                type="submit"
                size="icon"
                className="size-11 shrink-0 rounded-xl"
                disabled={!input.trim()}
                aria-label="Send message"
              >
                <Send className="size-4" />
              </Button>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
