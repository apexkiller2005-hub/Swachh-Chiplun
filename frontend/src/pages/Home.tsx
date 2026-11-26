import { Link } from "react-router-dom";
import { PickupPromoCard } from "@/components/doorstep/DoorstepMap";
import { ArrowRight, Lightbulb, MapPin, ScanLine, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CATEGORY_META, CATEGORY_ORDER } from "@/lib/types";

const STEPS = [
  {
    icon: ScanLine,
    title: "1 · Scan the item",
    body: "Point your camera or upload a photo (or type a hint / barcode). The AI vision model names the item and its waste category with a confidence score.",
  },
  {
    icon: Lightbulb,
    title: "2 · Learn the safe disposal",
    body: "Step-by-step guidance grounded in Indian rules — SWM Rules 2016 segregation, E-Waste (Management) Rules 2022, and biomedical waste handling — in English, हिंदी or मराठी.",
  },
  {
    icon: MapPin,
    title: "3 · Reach the right facility",
    body: "See the nearest e-waste centre, recycling unit, scrap dealer or hazardous drop-off around Chiplun on the map, with distance, hours and directions.",
  },
];

const CATEGORY_HINTS: Record<string, string> = {
  ewaste: "Phones, chargers, batteries, circuit boards, tube-lights — authorised e-waste recyclers only.",
  recyclable: "Clean plastic, paper, glass, metal, cardboard — dry waste stream.",
  general: "Soiled, non-recyclable waste — municipal general collection.",
  organic: "Food scraps and garden waste — compost it (wet waste).",
  hazardous: "Paints, chemicals, expired medicines — domestic hazardous stream, safe drop only.",
  biomedical: "Masks, syringes, sanitary waste — authorised biomedical handlers.",
};

export default function Home() {
  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-3xl bg-[#0D1B13] text-white">
        <img
          src="https://images.pexels.com/photos/19115417/pexels-photo-19115417.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940"
          alt="Vashishti river basin and Sahyadri foothills near Chiplun"
          className="absolute inset-0 h-full w-full object-cover opacity-45"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0D1B13]/80 to-[#0D1B13]/90" />
        <div className="relative z-10 px-6 py-12 sm:px-10 md:py-16">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">
            Student project · Chiplun, Ratnagiri district, Maharashtra
          </p>
          <h1 className="mt-3 max-w-2xl font-heading text-4xl font-bold leading-tight tracking-tight md:text-5xl">
            AI-Based Smart Waste Identification &amp; Disposal Assistant
          </h1>
          <p className="mt-4 max-w-xl leading-relaxed text-emerald-50/85">
            Snap a photo of any waste item — get its category and confidence score, safe disposal
            steps under Indian rules, and the nearest proper disposal or recycling facility on the
            map. Plus an AI assistant for every waste question.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Button size="lg" render={<Link to="/scan" />} data-testid="home-cta-scan">
              Start scanning <ArrowRight className="ml-1 h-4 w-4" aria-hidden />
            </Button>
            <Button
              size="lg"
              variant="outline"
              render={<Link to="/assistant" />}
              className="border-emerald-200/40 bg-transparent text-white hover:bg-white/10 hover:text-white"
              data-testid="home-cta-assistant"
            >
              <Sparkles className="mr-1 h-4 w-4" aria-hidden /> Ask the AI assistant
            </Button>
          </div>
          <div className="mt-7 flex flex-wrap gap-2">
            {CATEGORY_ORDER.map((cat) => (
              <span
                key={cat}
                className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium"
              >
                {CATEGORY_META[cat].label}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3 md:gap-6">
        {STEPS.map((step) => (
          <Card key={step.title} size="sm" className="lift border-emerald-950/10">
            <CardContent className="pt-5">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-700/10 text-emerald-700">
                <step.icon className="h-5 w-5" aria-hidden />
              </span>
              <h2 className="mt-4 font-heading text-lg font-bold tracking-tight text-emerald-950">
                {step.title}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-emerald-950/70">{step.body}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="rounded-2xl border border-emerald-950/10 bg-white p-6 shadow-sm md:p-8">
        <h2 className="font-heading text-xl font-bold tracking-tight text-emerald-950">
          What goes where — the six categories
        </h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CATEGORY_ORDER.map((cat) => (
            <div key={cat} className="rounded-xl border border-emerald-950/8 bg-[#F4F7F4] p-4">
              <span
                className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${CATEGORY_META[cat].pill}`}
              >
                {CATEGORY_META[cat].label}
              </span>
              <p className="mt-2 text-sm leading-relaxed text-emerald-950/70">
                {CATEGORY_HINTS[cat]}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col items-start gap-4 rounded-2xl bg-[#0D1B13] p-6 text-emerald-50 md:flex-row md:items-center md:justify-between md:p-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">
            Deployment path
          </p>
          <h2 className="mt-2 font-heading text-xl font-bold tracking-tight">
            Built for Chiplun — ready for Sahyadri Nisarg Mitra
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-emerald-100/80">
            Every facility, rule and language in this app is tuned to the Chiplun region. The
            project is designed so that the NGO can later adopt it as a public segregation and
            drop-off guide for the Ratnagiri district.
          </p>
        </div>
        <Button
          variant="outline"
          render={<Link to="/facilities" />}
          className="shrink-0 border-emerald-300/40 bg-transparent text-white hover:bg-white/10 hover:text-white"
          data-testid="home-cta-map"
        >
          Open facility map <MapPin className="ml-1 h-4 w-4" aria-hidden />
        </Button>
      </section>

      <PickupPromoCard testid="home-pickup-card" />
    </div>
  );
}