import { useQuery } from "@tanstack/react-query";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { BrainCircuit } from "lucide-react";

interface Config {
  extraction_model: string;
  openai_base_url: string;
  additional_base_urls: string;
}

export const EXTRACTION_MODELS = [
  { value: "azure.gpt-4o", label: "azure.gpt-4o", provider: "Azure" },
  { value: "azure.gpt-4.1", label: "azure.gpt-4.1", provider: "Azure" },
  { value: "azure.gpt-4.1-mini", label: "azure.gpt-4.1 Mini", provider: "Azure" },
  { value: "azure.gpt-4.1-nano", label: "azure.gpt-4.1 Nano", provider: "Azure" },
  { value: "gpt-4o", label: "gpt-4o", provider: "OpenAI" },
  { value: "gpt-4.1", label: "gpt-4.1", provider: "OpenAI" },
  { value: "gpt-4.1-mini", label: "gpt-4.1 Mini", provider: "OpenAI" },
  { value: "gpt-4.1-nano", label: "gpt-4.1 Nano", provider: "OpenAI" },
  { value: "claude-sonnet-4-5", label: "Claude Sonnet 4.5", provider: "Anthropic" },
  { value: "claude-opus-4", label: "Claude Opus 4", provider: "Anthropic" },
  { value: "claude-sonnet-4", label: "Claude Sonnet 4", provider: "Anthropic" },
];

export interface ExtractionOverrides {
  model: string;
  baseUrl: string;
}

interface ModelSelectorProps {
  value: ExtractionOverrides;
  onChange: (val: ExtractionOverrides) => void;
}

export function useDefaultExtractionOverrides(): ExtractionOverrides {
  const { data } = useQuery<Config>({ queryKey: ["/api/config"] });
  return {
    model: data?.extraction_model || "azure.gpt-4.1",
    baseUrl: data?.openai_base_url || "https://api.openai.com/v1",
  };
}

interface BaseUrlOption {
  label: string;
  url: string;
}

function parseAdditionalUrls(raw: string | undefined): BaseUrlOption[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) return arr.filter((item: any) => item.label && item.url);
  } catch {}
  return [];
}

export function ModelSelector({ value, onChange }: ModelSelectorProps) {
  const { data: config } = useQuery<Config>({ queryKey: ["/api/config"] });

  const defaultBaseUrl = config?.openai_base_url || "https://api.openai.com/v1";
  const additionalUrls = parseAdditionalUrls(config?.additional_base_urls);

  const allBaseUrls: BaseUrlOption[] = [
    { label: "Default", url: defaultBaseUrl },
    ...additionalUrls,
  ];

  const showBaseUrlSelector = !value.model.startsWith("claude-") && allBaseUrls.length > 1;

  return (
    <div className="flex items-center gap-2" data-testid="model-selector">
      <BrainCircuit className="h-4 w-4 text-muted-foreground shrink-0" />
      <Select
        value={value.model}
        onValueChange={(v) => onChange({ ...value, model: v })}
      >
        <SelectTrigger className="h-8 w-[180px] text-xs" data-testid="select-trigger-model">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {EXTRACTION_MODELS.map((m) => (
            <SelectItem key={m.value} value={m.value} data-testid={`option-model-${m.value}`}>
              <div className="flex items-center gap-2">
                <span className="text-xs">{m.label}</span>
                <Badge variant="outline" className="text-[9px] px-1 py-0">{m.provider}</Badge>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {showBaseUrlSelector && (
        <Select
          value={value.baseUrl}
          onValueChange={(v) => onChange({ ...value, baseUrl: v })}
        >
          <SelectTrigger className="h-8 w-[140px] text-xs" data-testid="select-trigger-base-url">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {allBaseUrls.map((b) => (
              <SelectItem key={b.url} value={b.url} data-testid={`option-baseurl-${b.label}`}>
                <span className="text-xs">{b.label}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
