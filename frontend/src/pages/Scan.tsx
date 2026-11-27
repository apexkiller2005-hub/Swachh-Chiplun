import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Barcode, Camera, CameraOff, CircleAlert, ScanLine, Sparkles, Upload } from "lucide-react";
import { toast } from "sonner";

import { apiPost } from "@/lib/api";
import {
  CATEGORY_META,
  LANGUAGES,
  asCategory,
  type Classification,
  type Language,
} from "@/lib/types";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

type Detector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };
const getDetector = (): Detector | null => {
  const Ctor = (window as unknown as { BarcodeDetector?: new () => Detector }).BarcodeDetector;
  return Ctor ? new Ctor() : null;
};

const PRESETS = ["Old mobile phone", "PET water bottle", "Broken tube light", "Kitchen vegetable peels", "Cardboard box"];

export default function Scan() {
  const [language, setLanguage] = useState<Language>("en");
  const [hint, setHint] = useState("");
  const [image, setImage] = useState<{ base64: string; mime: string } | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [result, setResult] = useState<Classification | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const qc = useQueryClient();

  useEffect(() => () => streamRef.current?.getTracks().forEach((t) => t.stop()), []);

  const classify = useMutation({
    mutationFn: (body: { image_base64: string | null; mime_type: string; hint: string | null; language: Language }) =>
      apiPost<Classification>("/classify", body),
    onSuccess: (data) => {
      setResult(data);
      qc.invalidateQueries({ queryKey: ["scans"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      if (!data.needs_follow_up) {
        toast.success(`Identified: ${data.item_name} (+${data.eco_points} eco points)`);
      }
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : "Classification failed — try again"),
  });

  const runClassify = (opts: { hint?: string; image?: { base64: string; mime: string } | null }) => {
    const hintValue = (opts.hint ?? hint).trim();
    const imageValue = opts.image === undefined ? image : opts.image;
    if (!hintValue && !imageValue) {
      toast.error("Capture a photo or type a hint first");
      return;
    }
    classify.mutate({
      image_base64: imageValue?.base64 ?? null,
      mime_type: imageValue?.mime ?? "image/jpeg",
      hint: hintValue || null,
      language,
    });
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraOn(true);
    } catch {
      toast.error("Camera unavailable — upload a photo instead");
    }
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
  };

  const grabFrame = (source: HTMLVideoElement | HTMLImageElement, w: number, h: number) => {
    const max = 768;
    const scale = Math.min(1, max / Math.max(w, h));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    canvas.getContext("2d")?.drawImage(source, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.8);
  };

  const capture = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const dataUrl = grabFrame(video, video.videoWidth, video.videoHeight);
    setImage({ base64: dataUrl.split(",")[1] ?? "", mime: "image/jpeg" });
    setPreview(dataUrl);
    setResult(null);
    toast.success("Frame captured — now classify it");
  };

  const onFile = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose a photo (JPG, PNG or WEBP)");
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      toast.error("That photo is too large (max 15 MB) — choose a smaller one");
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const dataUrl = grabFrame(img, img.naturalWidth, img.naturalHeight);
      URL.revokeObjectURL(url);
      setImage({ base64: dataUrl.split(",")[1] ?? "", mime: "image/jpeg" });
      setPreview(dataUrl);
      setResult(null);
    };
    img.src = url;
  };

  const scanBarcode = async () => {
    const detector = getDetector();
    const video = videoRef.current;
    if (!detector || !video) return;
    try {
      const codes = await detector.detect(video);
      if (codes.length > 0 && codes[0].rawValue) {
        const value = `Barcode: ${codes[0].rawValue}`;
        setHint(value);
        toast.success("Barcode detected");
      } else {
        toast.error("No barcode found in frame");
      }
    } catch {
      toast.error("Barcode scan failed");
    }
  };

  const answerFollowUp = (option: string) => {
    const combined = [hint.trim(), option].filter(Boolean).join(". ");
    setHint(combined);
    runClassify({ hint: combined });
  };

  const meta = result ? CATEGORY_META[asCategory(result.category)] : null;
  const hasDetector = getDetector() !== null;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-4">
        <Card className="overflow-hidden border-emerald-950/10">
          <div className="relative aspect-[4/3] w-full bg-[#0D1B13]">
            <video
              ref={videoRef}
              playsInline
              muted
              className={cn("h-full w-full object-cover", !cameraOn && "hidden")}
              data-testid="scan-camera-video"
            />
            {!cameraOn && preview && (
              <img src={preview} alt="Captured waste item" className="h-full w-full object-cover" data-testid="scan-preview" />
            )}
            {!cameraOn && !preview && (
              <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-emerald-100/70">
                <ScanLine className="h-12 w-12 animate-pulse" aria-hidden />
                <p className="text-sm">Start the camera or upload a photo</p>
              </div>
            )}
            {cameraOn && (
              <div className="pointer-events-none absolute inset-8 rounded-xl border-2 border-emerald-300/70 animate-pulse" aria-hidden />
            )}
          </div>
          <CardContent className="flex flex-wrap gap-2 pt-4">
            {cameraOn ? (
              <Button variant="outline" onClick={stopCamera} data-testid="scan-camera-stop">
                <CameraOff className="mr-1 h-4 w-4" aria-hidden /> Stop camera
              </Button>
            ) : (
              <Button onClick={startCamera} data-testid="scan-camera-start">
                <Camera className="mr-1 h-4 w-4" aria-hidden /> Start camera
              </Button>
            )}
            <Button onClick={capture} disabled={!cameraOn} data-testid="scan-capture">
              <ScanLine className="mr-1 h-4 w-4" aria-hidden /> Capture
            </Button>
            <label className={buttonVariants({ variant: "outline" })}>
              <Upload className="mr-1 h-4 w-4" aria-hidden /> Upload
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => onFile(e.target.files?.[0])}
                data-testid="scan-upload-input"
              />
            </label>
            {hasDetector && cameraOn && (
              <Button variant="ghost" onClick={scanBarcode} data-testid="scan-barcode">
                <Barcode className="mr-1 h-4 w-4" aria-hidden /> Barcode
              </Button>
            )}
          </CardContent>
        </Card>

        <Card className="border-emerald-950/10">
          <CardHeader>
            <CardTitle className="flex items-center justify-between font-heading text-base">
              Optional hint &amp; language
              <Select value={language} onValueChange={(v: string) => setLanguage(v as Language)}>
                <SelectTrigger size="sm" className="w-32" data-testid="scan-language">
                  <SelectValue>{(v: string) => LANGUAGES.find((l) => l.value === v)?.label ?? v}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((l) => (
                    <SelectItem key={l.value} value={l.value} data-testid={`scan-language-${l.value}`}>
                      {l.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              value={hint}
              onChange={(e) => setHint(e.target.value)}
              placeholder="e.g. broken tube light from my kitchen / Barcode: 8901234567890"
              data-testid="scan-hint"
            />
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((preset, i) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => {
                    setHint(preset);
                    setImage(null);
                    setPreview(null);
                    runClassify({ hint: preset, image: null });
                  }}
                  data-testid={`scan-preset-${i}`}
                  className="rounded-full border border-emerald-900/15 bg-[#F4F7F4] px-3 py-1 text-xs font-medium text-emerald-800 transition hover:border-emerald-700/40 hover:bg-emerald-50"
                >
                  <Sparkles className="mr-1 inline h-3 w-3" aria-hidden />
                  {preset}
                </button>
              ))}
            </div>
            <Button
              className="w-full"
              onClick={() => runClassify({})}
              disabled={classify.isPending}
              data-testid="scan-classify"
            >
              <ScanLine className="mr-1 h-4 w-4" aria-hidden />
              {classify.isPending ? "Identifying…" : "Identify waste item"}
            </Button>
          </CardContent>
        </Card>
      </div>

      <div>
        {result && meta ? (
          <Card className="border-emerald-950/10" data-testid="scan-result">
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-3 font-heading">
                <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${meta.pill}`}>
                  {result.category_label || meta.label}
                </span>
                <span className="text-xl font-bold">{result.item_name}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div>
                <div className="flex items-center justify-between text-sm text-emerald-950/70">
                  <span>Confidence</span>
                  <span className="font-semibold">{Math.round(result.confidence * 100)}%</span>
                </div>
                <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-emerald-600 transition-all"
                    style={{ width: `${Math.round(result.confidence * 100)}%` }}
                    data-testid="scan-confidence-fill"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="rounded-full bg-emerald-700 px-3 py-1 font-semibold text-white" data-testid="scan-eco-points">
                  +{result.eco_points} eco points
                </span>
                {result.subcategory && (
                  <span className="text-emerald-950/60">Type: {result.subcategory}</span>
                )}
              </div>

              {result.hazards.length > 0 && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-red-800">
                    <CircleAlert className="h-4 w-4" aria-hidden /> Handle with care
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {result.hazards.map((hazard, i) => (
                      <li key={i} className="text-sm text-red-800/90" data-testid={`scan-hazard-${i}`}>
                        • {hazard}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div>
                <h3 className="font-heading text-sm font-bold uppercase tracking-wider text-emerald-800">
                  How to dispose of it
                </h3>
                <ol className="mt-2 space-y-2">
                  {result.disposal_steps.map((step, i) => (
                    <li key={i} className="flex gap-2.5 text-sm leading-relaxed" data-testid={`scan-step-${i}`}>
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-700 text-[11px] font-bold text-white">
                        {i + 1}
                      </span>
                      {step}
                    </li>
                  ))}
                </ol>
              </div>

              {result.eco_tip && (
                <p className="rounded-xl bg-[#F4F7F4] p-3 text-sm italic text-emerald-950/75" data-testid="scan-eco-tip">
                  Eco tip: {result.eco_tip}
                </p>
              )}

              {result.needs_follow_up && result.follow_up_question && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4" data-testid="scan-followup">
                  <p className="text-sm font-semibold text-amber-800">{result.follow_up_question}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {result.follow_up_options.map((option, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => answerFollowUp(option)}
                        data-testid={`scan-followup-option-${i}`}
                        className="rounded-full border border-amber-300 bg-white px-3 py-1 text-xs font-medium text-amber-800 transition hover:bg-amber-100"
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <Button variant="outline" render={<Link to="/facilities" />} className="w-full" data-testid="scan-result-map-link">
                Find the nearest facility <span aria-hidden>→</span>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card className="flex h-full min-h-72 items-center justify-center border-dashed border-emerald-950/15 bg-[#F4F7F4]/60">
            <CardContent className="py-10 text-center">
              <ScanLine className="mx-auto h-10 w-10 text-emerald-700/50" aria-hidden />
              <p className="mt-4 max-w-xs text-sm leading-relaxed text-emerald-950/60">
                Your result appears here — item name, category, confidence, disposal steps and eco
                points. No photo handy? Tap a sample preset below the hint box to see it work.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}