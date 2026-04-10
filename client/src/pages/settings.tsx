import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  IndianRupee,
  DollarSign,
  RefreshCw,
  Save,
  Calculator,
  BrainCircuit,
  Key,
  Cpu,
  MessageSquareText,
  Settings2,
  RotateCcw,
  Eye,
  EyeOff,
  Plus,
  Trash2,
} from "lucide-react";

interface Config {
  usd_to_inr: string;
  extraction_mode: string;
  extraction_model: string;
  openai_api_key: string;
  anthropic_api_key: string;
  openai_base_url: string;
  additional_base_urls: string;
  vision_prompt: string;
  parallel_limit: string;
  process_email_attachments: string;
}

interface BaseUrlEntry {
  label: string;
  url: string;
}

interface CostSummary {
  totalInr: number;
  totalUsd: number;
  extractionInr: number;
  extractionUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
}

function formatInr(value: number): string {
  if (value < 0.01) return "₹0.00";
  return "₹" + value.toFixed(2);
}

function formatUsd(value: number): string {
  if (value < 0.0001) return "$0.0000";
  return "$" + value.toFixed(4);
}

function formatTokens(value: number): string {
  if (value >= 1_000_000) return (value / 1_000_000).toFixed(1) + "M";
  if (value >= 1_000) return (value / 1_000).toFixed(1) + "K";
  return value.toString();
}

const EXTRACTION_MODELS = [
  { value: "azure.gpt-4.1", label: "azure.gpt-4.1", provider: "Azure" },
  { value: "azure.gpt-4.1-mini", label: "azure.gpt-4.1 Mini", provider: "Azure" },
  { value: "azure.gpt-4.1-nano", label: "azure.gpt-4.1 Nano", provider: "Azure" },
  { value: "gpt-4.1", label: "gpt-4.1", provider: "OpenAI" },
  { value: "gpt-4.1-mini", label: "gpt-4.1 Mini", provider: "OpenAI" },
  { value: "gpt-4.1-nano", label: "gpt-4.1 Nano", provider: "OpenAI" },
  { value: "claude-sonnet-4-5", label: "Claude Sonnet 4.5", provider: "Anthropic" },
  { value: "claude-opus-4", label: "Claude Opus 4", provider: "Anthropic" },
  { value: "claude-sonnet-4", label: "Claude Sonnet 4", provider: "Anthropic" },
];


export default function SettingsPage() {
  const { toast } = useToast();
  const [config, setConfig] = useState<Config | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [showOpenAIKey, setShowOpenAIKey] = useState(false);
  const [showAnthropicKey, setShowAnthropicKey] = useState(false);
  const [openaiKeyInput, setOpenaiKeyInput] = useState("");
  const [anthropicKeyInput, setAnthropicKeyInput] = useState("");

  const { data: configData, isLoading } = useQuery<Config>({
    queryKey: ["/api/config"],
  });

  const { data: costs, isLoading: costsLoading } = useQuery<CostSummary>({
    queryKey: ["/api/costs/summary"],
  });

  useEffect(() => {
    if (configData && !config) {
      setConfig(configData);
      setOpenaiKeyInput(configData.openai_api_key || "");
      setAnthropicKeyInput(configData.anthropic_api_key || "");
    }
  }, [configData, config]);

  const updateField = (key: keyof Config, value: string) => {
    if (!config) return;
    setConfig({ ...config, [key]: value });
    setHasChanges(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!config) throw new Error("No config");
      const payload: any = { ...config };
      if (openaiKeyInput && !openaiKeyInput.startsWith("*")) {
        payload.openai_api_key = openaiKeyInput;
      }
      if (anthropicKeyInput && !anthropicKeyInput.startsWith("*")) {
        payload.anthropic_api_key = anthropicKeyInput;
      }
      const res = await apiRequest("PUT", "/api/config", payload);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Configuration saved", description: "All settings have been updated. Changes take effect on next extraction." });
      setHasChanges(false);
      queryClient.invalidateQueries({ queryKey: ["/api/config"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
    },
    onError: (err: Error) => {
      toast({ title: "Error saving config", description: err.message, variant: "destructive" });
    },
  });

  const resetPromptsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/config/reset-prompts");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Prompts reset", description: "All prompts have been restored to defaults." });
      setConfig(null);
      queryClient.invalidateQueries({ queryKey: ["/api/config"] });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const recalcMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/settings/recalculate-costs");
      const text = await res.text();
      try { return JSON.parse(text); } catch { return { success: true }; }
    },
    onSuccess: (data: any) => {
      toast({ title: "Costs recalculated", description: `All historical costs updated using rate ₹${data.rate}` });
      queryClient.invalidateQueries({ queryKey: ["/api/costs/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/costs/by-site"] });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const fetchLiveRate = async () => {
    try {
      const res = await fetch("https://open.er-api.com/v6/latest/USD");
      const data = await res.json();
      if (data.rates?.INR) {
        updateField("usd_to_inr", data.rates.INR.toFixed(2));
        toast({ title: "Live rate fetched", description: `Current rate: ₹${data.rates.INR.toFixed(2)}` });
      }
    } catch {
      toast({ title: "Error", description: "Failed to fetch live rate", variant: "destructive" });
    }
  };

  if (isLoading || !config) {
    return (
      <div className="p-6 space-y-6 max-w-6xl mx-auto">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  const totalCostInr = costs?.extractionInr ?? 0;
  const totalCostUsd = costs?.extractionUsd ?? 0;
  const selectedModel = EXTRACTION_MODELS.find(m => m.value === config.extraction_model);
  const needsAnthropicKey = config.extraction_model.startsWith("claude-");

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-settings-title">
            Configuration
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage API keys, models, prompts, and extraction settings
          </p>
        </div>
        <Button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending || !hasChanges}
          size="lg"
          data-testid="button-save-config"
        >
          <Save className="h-4 w-4 mr-2" />
          {saveMutation.isPending ? "Saving..." : "Save All Changes"}
        </Button>
      </div>

      <Tabs defaultValue="keys" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4 h-11" data-testid="tabs-config">
          <TabsTrigger value="keys" className="gap-2 text-xs sm:text-sm" data-testid="tab-keys">
            <Key className="h-3.5 w-3.5 hidden sm:block" /> API Keys
          </TabsTrigger>
          <TabsTrigger value="models" className="gap-2 text-xs sm:text-sm" data-testid="tab-models">
            <Cpu className="h-3.5 w-3.5 hidden sm:block" /> Models
          </TabsTrigger>
          <TabsTrigger value="prompts" className="gap-2 text-xs sm:text-sm" data-testid="tab-prompts">
            <MessageSquareText className="h-3.5 w-3.5 hidden sm:block" /> Prompts
          </TabsTrigger>
          <TabsTrigger value="advanced" className="gap-2 text-xs sm:text-sm" data-testid="tab-advanced">
            <Settings2 className="h-3.5 w-3.5 hidden sm:block" /> Advanced
          </TabsTrigger>
        </TabsList>

        <TabsContent value="keys" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="shadow-sm">
              <CardHeader className="pb-4">
                <CardTitle className="text-base flex items-center gap-2">
                  <div className="p-1.5 rounded-md bg-emerald-500/10">
                    <Key className="h-4 w-4 text-emerald-600" />
                  </div>
                  OpenAI API Key
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="relative">
                  <Input
                    type={showOpenAIKey ? "text" : "password"}
                    value={openaiKeyInput}
                    onChange={(e) => { setOpenaiKeyInput(e.target.value); setHasChanges(true); }}
                    placeholder="sk-..."
                    className="pr-10 font-mono text-sm"
                    data-testid="input-openai-key"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                    onClick={() => setShowOpenAIKey(!showOpenAIKey)}
                    data-testid="button-toggle-openai-key"
                  >
                    {showOpenAIKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Used for azure.gpt-4.1 vision extraction
                </p>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader className="pb-4">
                <CardTitle className="text-base flex items-center gap-2">
                  <div className="p-1.5 rounded-md bg-violet-500/10">
                    <Key className="h-4 w-4 text-violet-600" />
                  </div>
                  Anthropic API Key
                  {needsAnthropicKey && <Badge variant="outline" className="text-xs border-amber-300 text-amber-600">Required</Badge>}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="relative">
                  <Input
                    type={showAnthropicKey ? "text" : "password"}
                    value={anthropicKeyInput}
                    onChange={(e) => { setAnthropicKeyInput(e.target.value); setHasChanges(true); }}
                    placeholder="sk-ant-..."
                    className="pr-10 font-mono text-sm"
                    data-testid="input-anthropic-key"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                    onClick={() => setShowAnthropicKey(!showAnthropicKey)}
                    data-testid="button-toggle-anthropic-key"
                  >
                    {showAnthropicKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Required only when using Claude models for extraction
                </p>
              </CardContent>
            </Card>
          </div>

          <Card className="shadow-sm">
            <CardHeader className="pb-4">
              <CardTitle className="text-base flex items-center gap-2">
                <div className="p-1.5 rounded-md bg-blue-500/10">
                  <Settings2 className="h-4 w-4 text-blue-600" />
                </div>
                OpenAI Base URL
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                value={config.openai_base_url}
                onChange={(e) => updateField("openai_base_url", e.target.value)}
                placeholder="https://api.openai.com/v1"
                className="font-mono text-sm"
                data-testid="input-openai-base-url"
              />
              <p className="text-xs text-muted-foreground">
                Default: https://api.openai.com/v1 — Change only for custom OpenAI-compatible endpoints
              </p>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader className="pb-4">
              <CardTitle className="text-base flex items-center gap-2">
                <div className="p-1.5 rounded-md bg-indigo-500/10">
                  <Plus className="h-4 w-4 text-indigo-600" />
                </div>
                Additional OpenAI Base URLs
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Add extra OpenAI-compatible endpoints (e.g. Azure, local LLMs). You can switch between them when starting an extraction.
              </p>
              {(() => {
                let entries: BaseUrlEntry[] = [];
                try { entries = JSON.parse(config.additional_base_urls || "[]"); } catch {}

                const updateEntries = (newEntries: BaseUrlEntry[]) => {
                  updateField("additional_base_urls", JSON.stringify(newEntries));
                };

                return (
                  <div className="space-y-3">
                    {entries.map((entry, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <Input
                          value={entry.label}
                          onChange={(e) => {
                            const updated = [...entries];
                            updated[idx] = { ...updated[idx], label: e.target.value };
                            updateEntries(updated);
                          }}
                          placeholder="Label (e.g. Azure East)"
                          className="w-[160px] text-sm"
                          data-testid={`input-additional-url-label-${idx}`}
                        />
                        <Input
                          value={entry.url}
                          onChange={(e) => {
                            const updated = [...entries];
                            updated[idx] = { ...updated[idx], url: e.target.value };
                            updateEntries(updated);
                          }}
                          placeholder="https://..."
                          className="flex-1 font-mono text-sm"
                          data-testid={`input-additional-url-${idx}`}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => {
                            const updated = entries.filter((_, i) => i !== idx);
                            updateEntries(updated);
                          }}
                          data-testid={`button-remove-url-${idx}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => updateEntries([...entries, { label: "", url: "" }])}
                      data-testid="button-add-base-url"
                    >
                      <Plus className="h-3.5 w-3.5 mr-1.5" />
                      Add Base URL
                    </Button>
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="models" className="space-y-6">
          <Card className="shadow-sm">
            <CardHeader className="pb-4">
              <CardTitle className="text-base flex items-center gap-2">
                <div className="p-1.5 rounded-md bg-primary/10">
                  <BrainCircuit className="h-4 w-4 text-primary" />
                </div>
                Extraction Model
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Select
                value={config.extraction_model}
                onValueChange={(v) => updateField("extraction_model", v)}
                data-testid="select-extraction-model"
              >
                <SelectTrigger data-testid="select-trigger-extraction-model">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXTRACTION_MODELS.map((m) => (
                    <SelectItem key={m.value} value={m.value} data-testid={`option-model-${m.value}`}>
                      <div className="flex items-center gap-2">
                        <span>{m.label}</span>
                        <Badge variant="outline" className="text-[10px] px-1.5">{m.provider}</Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedModel && (
                <div className="p-3 rounded-lg bg-muted/50 text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Provider</span>
                    <span className="font-medium">{selectedModel.provider}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Model ID</span>
                    <span className="font-mono text-xs">{selectedModel.value}</span>
                  </div>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                The LLM used for extracting tag values from documents
              </p>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader className="pb-4">
              <CardTitle className="text-base flex items-center gap-2">
                <div className="p-1.5 rounded-md bg-amber-500/10">
                  <IndianRupee className="h-4 w-4 text-amber-600" />
                </div>
                Cost Tracking
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <Label htmlFor="rate">USD to INR Rate</Label>
                  <div className="flex gap-2">
                    <Input
                      id="rate"
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={config.usd_to_inr}
                      onChange={(e) => updateField("usd_to_inr", e.target.value)}
                      placeholder="83.50"
                      className="flex-1"
                      data-testid="input-usd-inr-rate"
                    />
                    <Button variant="outline" onClick={fetchLiveRate} data-testid="button-fetch-live-rate">
                      <RefreshCw className="h-4 w-4 mr-1" /> Live
                    </Button>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => recalcMutation.mutate()}
                    disabled={recalcMutation.isPending}
                    data-testid="button-recalculate-costs"
                  >
                    <Calculator className="h-3.5 w-3.5 mr-1.5" />
                    {recalcMutation.isPending ? "Recalculating..." : "Recalculate All Costs"}
                  </Button>
                </div>
                <div className="space-y-3">
                  <Label>Current Totals</Label>
                  {costsLoading ? (
                    <Skeleton className="h-20" />
                  ) : (
                    <div className="p-4 rounded-lg bg-muted/50 space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">Total Cost</span>
                        <span className="font-bold" data-testid="text-total-cost-inr">{formatInr(totalCostInr)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">USD</span>
                        <span className="text-sm">{formatUsd(totalCostUsd)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">Tokens</span>
                        <span className="text-sm font-mono" data-testid="text-total-tokens">{formatTokens(costs?.totalTokens ?? 0)}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="prompts" className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold">Extraction Prompt</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Use <code className="bg-muted px-1 py-0.5 rounded text-[11px]">{"{tags_list}"}</code> and <code className="bg-muted px-1 py-0.5 rounded text-[11px]">{"{tag_names_json}"}</code> as placeholders
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => resetPromptsMutation.mutate()}
              disabled={resetPromptsMutation.isPending}
              data-testid="button-reset-prompts"
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
              Reset to Defaults
            </Button>
          </div>

          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Badge className="bg-emerald-500/10 text-emerald-600 border-0 text-xs">Vision</Badge>
                Vision Extraction Prompt
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Sends document page images to the LLM with this prompt for tag extraction.
              </p>
            </CardHeader>
            <CardContent>
              <Textarea
                value={config.vision_prompt}
                onChange={(e) => updateField("vision_prompt", e.target.value)}
                className="min-h-[280px] font-mono text-xs leading-relaxed"
                data-testid="textarea-vision-prompt"
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="advanced" className="space-y-6">
          <Card className="shadow-sm">
            <CardHeader className="pb-4">
              <CardTitle className="text-base">Vision &amp; Extraction Settings</CardTitle>
              <p className="text-xs text-muted-foreground">Controls document processing and extraction behavior</p>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="parallel">Parallel Threads</Label>
                  <Input
                    id="parallel"
                    type="number"
                    min="1"
                    max="20"
                    value={config.parallel_limit}
                    onChange={(e) => updateField("parallel_limit", e.target.value)}
                    data-testid="input-parallel-limit"
                  />
                  <p className="text-[11px] text-muted-foreground">Concurrent extractions (default: 5)</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email-attachments">Process Email Attachments</Label>
                  <div className="flex items-center gap-3 pt-1">
                    <Switch
                      id="email-attachments"
                      checked={config.process_email_attachments === "true"}
                      onCheckedChange={(checked) => updateField("process_email_attachments", checked ? "true" : "false")}
                      data-testid="switch-email-attachments"
                    />
                    <span className="text-sm text-muted-foreground">
                      {config.process_email_attachments === "true" ? "Enabled" : "Disabled"}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">Extract and process attachments (PDF, DOCX, TXT) from .eml and .msg files during extraction</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
