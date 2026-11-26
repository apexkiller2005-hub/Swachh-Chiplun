import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { MapPin, Send } from "lucide-react";

import { apiGet, apiPost } from "@/lib/api";
import {
  CATEGORY_META,
  asCategory,
  type ChatHistoryMessage,
  type ChatResponse,
  type Classification,
  type Facility,
  type Language,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const QUICK_PROMPTS: Record<Language, string[]> = {
  en: [
    "What do I do with a broken tube light?",
    "Is a PET bottle recyclable?",
    "Where can I dispose of old batteries?",
    "How do I start composting at home?",
  ],
  hi: [
    "टूटी ट्यूबलाइट का क्या करें?",
    "क्या PET बोतल रिसाइकल होती है?",
    "पुरानी बैटरियाँ कहाँ दूँ?",
    "घर पर कम्पोस्टिंग कैसे शुरू करें?",
  ],
  mr: [
    "तुटलेल्या ट्यूबलाइटचे काय करावे?",
    "PET बाटली रीसायकल होते का?",
    "जुन्या बॅटरी कुठे द्याव्यात?",
    "घरी कंपोस्टिंग कसे सुरू करावे?",
  ],
};

const PLACEHOLDERS: Record<Language, string> = {
  en: "Ask about segregation, recycling, e-waste laws, composting…",
  hi: "कचरे के बँटवारे, रिसाइक्लिंग, ई-वेस्ट कानून के बारे में पूछें…",
  mr: "कचऱ्याची विभागणी, रीसायक्लिंग, ई-वेस्ट कायदे याविषयी विचारा…",
};

const LANG_TABS: { value: Language; label: string; testid: string }[] = [
  { value: "en", label: "English", testid: "chat-lang-en" },
  { value: "hi", label: "हिंदी", testid: "chat-lang-hi" },
  { value: "mr", label: "मराठी", testid: "chat-lang-mr" },
];

export default function Chat() {
  const [language, setLanguage] = useState<Language>("en");
  const [messages, setMessages] = useState<ChatHistoryMessage[]>([
    {
      role: "assistant",
      content:
        "Namaste! I am Nisarg Sahyak, your waste-help assistant for Chiplun. Ask me about segregation rules, recycling methods, e-waste laws, composting or reuse ideas — or tell me what you scanned and I'll help you dispose of it safely.",
    },
  ]);
  const [draft, setDraft] = useState("");
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const endRef = useRef<HTMLDivElement>(null);

  const lastScan = useQuery({
    queryKey: ["scans", "last"],
    queryFn: () => apiGet<Classification[]>("/scans?limit=1"),
    retry: false,
  });

  const chat = useMutation({
    mutationFn: (body: {
      message: string;
      language: Language;
      history: ChatHistoryMessage[];
      scan_context: { item_name: string; category: string } | undefined;
    }) => apiPost<ChatResponse>("/chat", body),
    onSuccess: (data) => {
      setMessages((m) => [...m, { role: "assistant", content: data.reply }]);
      setFacilities(data.facilities_used ?? []);
    },
    onError: () =>
      setMessages((m) => [
        ...m,
        { role: "assistant", content: "Sorry — the assistant is unreachable right now. Please try again." },
      ]),
  });

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, chat.isPending]);

  const send = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || chat.isPending) return;
    const last = lastScan.data?.[0];
    setMessages((m) => [...m, { role: "user", content: trimmed }]);
    setDraft("");
    chat.mutate({
      message: trimmed,
      language,
      history: messages.slice(-8),
      scan_context: last ? { item_name: last.item_name, category: last.category } : undefined,
    });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="flex h-[70vh] min-h-96 flex-col border-emerald-950/10 lg:col-span-2">
        <div className="flex items-center justify-between gap-2 border-b border-emerald-950/10 px-4 py-3">
          <p className="font-heading text-sm font-bold text-emerald-950">Nisarg Sahyak · AI waste assistant</p>
          <div className="flex gap-1" role="tablist" aria-label="Assistant language">
            {LANG_TABS.map((tab) => (
              <button
                key={tab.value}
                type="button"
                role="tab"
                aria-selected={language === tab.value}
                data-selected={language === tab.value}
                onClick={() => setLanguage(tab.value)}
                data-testid={tab.testid}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-semibold transition",
                  language === tab.value
                    ? "bg-emerald-700 text-white"
                    : "bg-[#F4F7F4] text-emerald-800 hover:bg-emerald-100",
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {messages.map((msg, i) => (
            <div
              key={i}
              data-testid={`chat-bubble-${i}`}
              className={cn(
                "max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed",
                msg.role === "user"
                  ? "ml-auto rounded-br-sm bg-emerald-700 text-white"
                  : "rounded-bl-sm border border-emerald-950/10 bg-white text-emerald-950/90",
              )}
            >
              {msg.content}
            </div>
          ))}
          {chat.isPending && (
            <div className="max-w-[85%] rounded-2xl rounded-bl-sm border border-emerald-950/10 bg-white px-4 py-3 text-sm text-emerald-950/50" data-testid="chat-typing">
              Thinking…
            </div>
          )}
          <div ref={endRef} />
        </div>

        {facilities.length > 0 && (
          <div className="border-t border-emerald-950/10 px-4 py-3" data-testid="chat-facilities">
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-800">
              Facilities the assistant found
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {facilities.map((f) => (
                <Link
                  key={f.id}
                  to="/facilities"
                  className="inline-flex items-center gap-1.5 rounded-full border border-emerald-900/15 bg-[#F4F7F4] px-3 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-50"
                  data-testid={`chat-facility-${f.id}`}
                >
                  <MapPin className="h-3 w-3" aria-hidden />
                  {f.name}
                  {f.distance_m != null && ` · ${(f.distance_m / 1000).toFixed(1)} km`}
                </Link>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-2 border-t border-emerald-950/10 p-3">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(draft);
              }
            }}
            placeholder={PLACEHOLDERS[language]}
            data-testid="chat-input"
          />
          <Button onClick={() => send(draft)} disabled={chat.isPending || !draft.trim()} data-testid="chat-send">
            <Send className="h-4 w-4" aria-hidden />
            <span className="sr-only">Send</span>
          </Button>
        </div>
      </Card>

      <div className="space-y-4">
        <Card size="sm" className="border-emerald-950/10">
          <CardContent className="pt-5">
            <h2 className="font-heading text-sm font-bold uppercase tracking-wider text-emerald-800">
              Try asking
            </h2>
            <div className="mt-3 space-y-2">
              {QUICK_PROMPTS[language].map((prompt, i) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => send(prompt)}
                  disabled={chat.isPending}
                  data-testid={`chat-quick-${i}`}
                  className="w-full rounded-xl border border-emerald-900/10 bg-[#F4F7F4] px-3 py-2.5 text-left text-sm text-emerald-900 transition hover:border-emerald-700/40 hover:bg-emerald-50"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {lastScan.data?.[0] && (
          <Card size="sm" className="border-emerald-950/10">
            <CardContent className="pt-5">
              <h2 className="font-heading text-sm font-bold uppercase tracking-wider text-emerald-800">
                Context from your last scan
              </h2>
              <div className="mt-3 flex items-center gap-2">
                <span
                  className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                    CATEGORY_META[asCategory(lastScan.data[0].category)].pill
                  }`}
                  data-testid="chat-context-pill"
                >
                  {CATEGORY_META[asCategory(lastScan.data[0].category)].label}
                </span>
                <p className="text-sm font-medium text-emerald-950">{lastScan.data[0].item_name}</p>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-emerald-950/60">
                The assistant already knows what you scanned — ask "where do I take this?" for
                nearby facilities.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}