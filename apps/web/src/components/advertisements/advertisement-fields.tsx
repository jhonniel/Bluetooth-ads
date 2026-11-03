"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { uploadImageAction } from "@/app/(dashboard)/advertisements/actions";
import type { AdvertisementDraft, AdvertisementDraftErrors } from "./advertisement-draft";

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const ACCEPTED = ["image/png", "image/jpeg", "image/webp"];

function ImageUploadField({ value, onChange, error }: { value: string; onChange: (url: string) => void; error?: string }) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = async (file: File) => {
    if (!ACCEPTED.includes(file.type)) return toast.error("Use a PNG, JPEG or WebP image.");
    if (file.size > MAX_IMAGE_BYTES) return toast.error("Images must be 2 MB or smaller.");
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    const result = await uploadImageAction(formData);
    setUploading(false);
    if (inputRef.current) inputRef.current.value = "";
    if (!result.ok) return toast.error(result.error);
    onChange(result.data.url);
    toast.success("Image uploaded.");
  };

  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor="ad-image-url">Promotional image</FieldLabel>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="flex aspect-[2/1] w-full shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted/40 sm:w-48">
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element -- arbitrary admin-provided hosts
            <img src={value} alt="Promotional image preview" className="size-full object-cover" />
          ) : (
            <ImagePlus className="size-6 text-muted-foreground" />
          )}
        </div>
        <div className="flex flex-1 flex-col gap-2">
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => inputRef.current?.click()}>
              {uploading ? <Loader2 className="animate-spin" /> : <ImagePlus />}
              {uploading ? "Uploading…" : "Upload image"}
            </Button>
            {value ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => onChange("")} disabled={uploading}>
                <Trash2 /> Remove
              </Button>
            ) : null}
          </div>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED.join(",")}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
            }}
          />
          <Input id="ad-image-url" value={value} onChange={(e) => onChange(e.target.value)} placeholder="…or paste an https:// image URL" aria-invalid={Boolean(error)} />
          <FieldDescription>PNG, JPEG or WebP up to 2 MB. A 2:1 aspect ratio works best.</FieldDescription>
          <FieldError>{error}</FieldError>
        </div>
      </div>
    </Field>
  );
}

export function AdvertisementFields({
  value,
  onChange,
  errors,
}: {
  value: AdvertisementDraft;
  onChange: (value: AdvertisementDraft) => void;
  errors: AdvertisementDraftErrors;
}) {
  const set = <K extends keyof AdvertisementDraft>(key: K, v: AdvertisementDraft[K]) => onChange({ ...value, [key]: v });

  return (
    <FieldGroup>
      <Field data-invalid={Boolean(errors.name)}>
        <FieldLabel htmlFor="ad-name">Advertisement name</FieldLabel>
        <Input id="ad-name" value={value.name} onChange={(e) => set("name", e.target.value)} maxLength={120} aria-invalid={Boolean(errors.name)} />
        <FieldDescription>Internal name used to reuse this content across campaigns.</FieldDescription>
        <FieldError>{errors.name}</FieldError>
      </Field>
      <div className="grid gap-5 md:grid-cols-2">
        <Field data-invalid={Boolean(errors.title)}>
          <FieldLabel htmlFor="ad-title">Notification title</FieldLabel>
          <Input id="ad-title" value={value.title} onChange={(e) => set("title", e.target.value)} maxLength={65} aria-invalid={Boolean(errors.title)} />
          <FieldDescription>{value.title.length}/65 characters</FieldDescription>
          <FieldError>{errors.title}</FieldError>
        </Field>
        <Field data-invalid={Boolean(errors.ctaLabel)}>
          <FieldLabel htmlFor="ad-cta">Call-to-action label</FieldLabel>
          <Input id="ad-cta" value={value.ctaLabel} onChange={(e) => set("ctaLabel", e.target.value)} maxLength={30} placeholder="View Promotion" aria-invalid={Boolean(errors.ctaLabel)} />
          <FieldError>{errors.ctaLabel}</FieldError>
        </Field>
      </div>
      <Field data-invalid={Boolean(errors.message)}>
        <FieldLabel htmlFor="ad-message">Notification message</FieldLabel>
        <Textarea id="ad-message" value={value.message} onChange={(e) => set("message", e.target.value)} maxLength={240} rows={3} aria-invalid={Boolean(errors.message)} />
        <FieldDescription>{value.message.length}/240 characters</FieldDescription>
        <FieldError>{errors.message}</FieldError>
      </Field>
      <Field data-invalid={Boolean(errors.description)}>
        <FieldLabel htmlFor="ad-description">Promotional description</FieldLabel>
        <Textarea id="ad-description" value={value.description} onChange={(e) => set("description", e.target.value)} maxLength={2000} rows={3} aria-invalid={Boolean(errors.description)} />
        <FieldDescription>Optional details shown when the customer opens the promotion in the app.</FieldDescription>
        <FieldError>{errors.description}</FieldError>
      </Field>
      <ImageUploadField value={value.imageUrl} onChange={(url) => set("imageUrl", url)} error={errors.imageUrl} />
      <Field data-invalid={Boolean(errors.landingUrl)}>
        <FieldLabel htmlFor="ad-landing">Landing page URL</FieldLabel>
        <Input id="ad-landing" type="url" value={value.landingUrl} onChange={(e) => set("landingUrl", e.target.value)} placeholder="https://" aria-invalid={Boolean(errors.landingUrl)} />
        <FieldDescription>Must use https://. Opened when the customer taps the call to action.</FieldDescription>
        <FieldError>{errors.landingUrl}</FieldError>
      </Field>
    </FieldGroup>
  );
}
