"use client";

import { AudioWaveform, Brain, FileText, Image, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { StreamingMarkdown } from "@/components/markdown/StreamingMarkdown";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { OpenRouterModel } from "@/zoeflow/openrouter/models";
import { parseUsdPerToken } from "@/zoeflow/openrouter/pricing";
import { useOpenRouterModelsById } from "@/zoeflow/openrouter/useOpenRouterModels";
import SimpleBar from "simplebar-react";

type ModelsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type SortOption =
  | "name"
  | "provider"
  | "input-cost"
  | "output-cost"
  | "context-length";

/**
 * Extract provider name from model ID (e.g., "openai/gpt-4" -> "openai").
 */
function getProviderFromModelId(modelId: string): string {
  const parts = modelId.split("/");
  return parts[0] ?? "unknown";
}

/**
 * Get input cost (prompt pricing) as a number for sorting.
 */
function getInputCost(model: OpenRouterModel): number {
  const cost = parseUsdPerToken(model.pricing?.prompt);
  return cost ?? Infinity;
}

/**
 * Get output cost (completion pricing) as a number for sorting.
 */
function getOutputCost(model: OpenRouterModel): number {
  const cost = parseUsdPerToken(model.pricing?.completion);
  return cost ?? Infinity;
}

/**
 * Format price string for display.
 */
function formatPrice(value: string | undefined): string {
  if (!value) return "N/A";
  const num = parseUsdPerToken(value);
  if (num === null) return "N/A";
  if (num < 0.0001) {
    return `$${(num * 1000000).toFixed(2)}/1M tokens`;
  }
  return `$${num.toFixed(6)}/token`;
}

/**
 * Check if a pricing field has a meaningful (non-zero) value.
 * Returns true if the field exists and has a non-zero value.
 */
function hasPricing(value: string | undefined): boolean {
  if (!value) return false;
  const num = parseUsdPerToken(value);
  if (num === null) return false;
  return num > 0;
}

/**
 * Determine model input capabilities based on pricing fields.
 */
function getModelCapabilities(model: OpenRouterModel) {
  return {
    text: true, // All models support text
    image: !!model.pricing?.image,
    audio: !!model.pricing?.audio,
  };
}

/**
 * Render capability icons for a model.
 */
function ModelCapabilitiesIcons({ model }: { model: OpenRouterModel }) {
  const capabilities = getModelCapabilities(model);
  return (
    <div className="flex items-center gap-1.5">
      <FileText
        className="h-3.5 w-3.5 text-muted-foreground"
        aria-label="Text input"
      />
      {capabilities.image && (
        <Image
          className="h-3.5 w-3.5 text-muted-foreground"
          aria-label="Image input"
        />
      )}
      {capabilities.audio && (
        <AudioWaveform
          className="h-3.5 w-3.5 text-muted-foreground"
          aria-label="Audio input"
        />
      )}
    </div>
  );
}

/**
 * Dialog for browsing and viewing OpenRouter models.
 */
export function ModelsDialog({ open, onOpenChange }: ModelsDialogProps) {
  const modelsById = useOpenRouterModelsById();
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("name");

  const models = useMemo(() => {
    return Object.values(modelsById);
  }, [modelsById]);

  const filteredAndSortedModels = useMemo(() => {
    let filtered = models;

    // Apply search filter
    if (searchQuery.trim()) {
      const searchTerms = searchQuery
        .toLowerCase()
        .split(/\s+/)
        .filter((term) => term.length > 0);
      filtered = filtered.filter((model) => {
        const id = model.id.toLowerCase();
        const name = model.name?.toLowerCase() ?? "";
        const provider = getProviderFromModelId(model.id).toLowerCase();
        // All search terms must match (AND condition)
        return searchTerms.every((term) => {
          return (
            id.includes(term) || name.includes(term) || provider.includes(term)
          );
        });
      });
    }

    // Apply sorting
    const sorted = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case "name":
          return (a.name ?? a.id).localeCompare(b.name ?? b.id);
        case "provider": {
          const providerA = getProviderFromModelId(a.id);
          const providerB = getProviderFromModelId(b.id);
          return providerA.localeCompare(providerB);
        }
        case "input-cost": {
          const costA = getInputCost(a);
          const costB = getInputCost(b);
          return costA - costB;
        }
        case "output-cost": {
          const costA = getOutputCost(a);
          const costB = getOutputCost(b);
          return costA - costB;
        }
        case "context-length": {
          const lenA = a.context_length ?? 0;
          const lenB = b.context_length ?? 0;
          return lenB - lenA; // Descending (larger first)
        }
        default:
          return 0;
      }
    });

    return sorted;
  }, [models, searchQuery, sortBy]);

  const selectedModel = useMemo(() => {
    if (!selectedModelId) return null;
    return modelsById[selectedModelId] ?? null;
  }, [selectedModelId, modelsById]);

  // Auto-select first model if none selected
  useEffect(() => {
    if (open && !selectedModelId && filteredAndSortedModels.length > 0) {
      const firstModelId = filteredAndSortedModels[0]?.id ?? null;
      if (firstModelId) {
        // Use setTimeout to avoid synchronous setState in effect
        setTimeout(() => setSelectedModelId(firstModelId), 0);
      }
    }
  }, [open, selectedModelId, filteredAndSortedModels]);

  const handleModelClick = useCallback((modelId: string) => {
    setSelectedModelId(modelId);
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-6xl h-[80vh] flex flex-col"
        aria-label="Models"
      >
        <DialogHeader>
          <DialogTitle>ZoeFlow Models</DialogTitle>
          <DialogDescription>
            ZoeFlow uses OpenRouter as its inference backend. Browse available
            models, providers, pricing, and capabilities.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-1 gap-4 min-h-0 overflow-hidden">
          {/* Left Column: Model Details */}
          <div className="flex flex-col w-2/3 border rounded-md bg-muted/60 min-h-0">
            <div className="p-4 border-b flex-shrink-0">
              <div className="flex items-center gap-2">
                <Brain className="h-6 w-6" />
                <h3 className="font-semibold text-xl font-mono">
                  {selectedModel ? selectedModel.id : "Model Details"}
                </h3>
              </div>
            </div>
            <SimpleBar className="flex-1 min-h-0" autoHide={false}>
              <div className="p-4 space-y-3">
                {selectedModel ? (
                  <>
                    {selectedModel.name && (
                      <div>
                        <div className="text-sm font-semibold text-muted-foreground mb-1">
                          Name
                        </div>
                        <div className="text-sm text-foreground mb-1">
                          {selectedModel.name}
                        </div>
                      </div>
                    )}

                    {/*<div>
                    <div className="text-sm font-medium text-muted-foreground mb-1">
                      Provider
                    </div>
                    <div className="text-sm">
                      {getProviderFromModelId(selectedModel.id)}
                    </div>
                  </div>*/}

                    <div>
                      <div className="text-sm font-semibold text-muted-foreground mb-1">
                        Capabilities
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">Text</span>
                        </div>
                        {getModelCapabilities(selectedModel).image && (
                          <div className="flex items-center gap-1.5">
                            <Image
                              className="h-4 w-4 text-muted-foreground"
                              aria-label="Image input"
                            />
                            <span className="text-sm">Image</span>
                          </div>
                        )}
                        {getModelCapabilities(selectedModel).audio && (
                          <div className="flex items-center gap-1.5">
                            <AudioWaveform className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm">Audio</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {selectedModel.description && (
                      <div>
                        <div className="text-sm font-semibold text-muted-foreground mb-1">
                          Description
                        </div>
                        <div className="text-xs">
                          <StreamingMarkdown
                            text={selectedModel.description}
                            baseUrl="https://openrouter.ai"
                          />
                        </div>
                      </div>
                    )}

                    {selectedModel.context_length && (
                      <div>
                        <div className="text-sm font-semibold text-muted-foreground mb-1">
                          Context Length
                        </div>
                        <div className="text-sm">
                          {selectedModel.context_length.toLocaleString()} tokens
                        </div>
                      </div>
                    )}

                    <div>
                      <div className="text-sm font-semibold text-muted-foreground mb-2">
                        Pricing
                      </div>
                      <div className="space-y-2 text-sm">
                        <div>
                          <span className="text-muted-foreground">Input :</span>{" "}
                          {formatPrice(selectedModel.pricing?.prompt)}
                        </div>
                        <div>
                          <span className="text-muted-foreground">
                            Output :
                          </span>{" "}
                          {formatPrice(selectedModel.pricing?.completion)}
                        </div>
                        {hasPricing(selectedModel.pricing?.request) && (
                          <div>
                            <span className="text-muted-foreground">
                              Per request:
                            </span>{" "}
                            {formatPrice(selectedModel.pricing?.request)}
                          </div>
                        )}
                        {hasPricing(selectedModel.pricing?.image) && (
                          <div>
                            <span className="text-muted-foreground">
                              Image:
                            </span>{" "}
                            {formatPrice(selectedModel.pricing?.image)}
                          </div>
                        )}
                        {hasPricing(selectedModel.pricing?.audio) && (
                          <div>
                            <span className="text-muted-foreground">
                              Audio:
                            </span>{" "}
                            {formatPrice(selectedModel.pricing?.audio)}
                          </div>
                        )}
                        {hasPricing(selectedModel.pricing?.web_search) && (
                          <div>
                            <span className="text-muted-foreground">
                              Web search:
                            </span>{" "}
                            {formatPrice(selectedModel.pricing?.web_search)}
                          </div>
                        )}
                        {hasPricing(
                          selectedModel.pricing?.internal_reasoning,
                        ) && (
                          <div>
                            <span className="text-muted-foreground">
                              Internal reasoning:
                            </span>{" "}
                            {formatPrice(
                              selectedModel.pricing?.internal_reasoning,
                            )}
                          </div>
                        )}
                        {hasPricing(selectedModel.pricing?.thinking) && (
                          <div>
                            <span className="text-muted-foreground">
                              Thinking:
                            </span>{" "}
                            {formatPrice(selectedModel.pricing?.thinking)}
                          </div>
                        )}
                        {hasPricing(
                          selectedModel.pricing?.input_cache_read,
                        ) && (
                          <div>
                            <span className="text-muted-foreground">
                              Input cache read:
                            </span>{" "}
                            {formatPrice(
                              selectedModel.pricing?.input_cache_read,
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-muted-foreground text-center py-8">
                    Select a model from the list to view details
                  </div>
                )}
              </div>
            </SimpleBar>
          </div>

          {/* Right Column: Model List */}
          <div className="flex flex-col w-1/2 border rounded-md min-h-0">
            <div className="p-3 border-b flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 flex-1">
                  <Search className="h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search models..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="flex-1"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground whitespace-nowrap">
                    Sort by:
                  </span>
                  <Select
                    value={sortBy}
                    onValueChange={(v) => setSortBy(v as SortOption)}
                  >
                    <SelectTrigger className="w-[180px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="z-[220]">
                      <SelectItem value="name">Model Name</SelectItem>
                      <SelectItem value="provider">Provider</SelectItem>
                      <SelectItem value="input-cost">Input Cost</SelectItem>
                      <SelectItem value="output-cost">Output Cost</SelectItem>
                      <SelectItem value="context-length">
                        Context Length
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <SimpleBar className="flex-1 min-h-0" autoHide={false}>
              {filteredAndSortedModels.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground text-center">
                  {searchQuery.trim()
                    ? "No models found matching your search."
                    : "Loading models..."}
                </div>
              ) : (
                <ul className="divide-y">
                  {filteredAndSortedModels.map((model) => {
                    const provider = getProviderFromModelId(model.id);
                    const isSelected = selectedModelId === model.id;
                    return (
                      <li
                        key={model.id}
                        className={`
                          p-3 cursor-pointer transition-colors
                          ${isSelected ? "bg-muted" : "hover:bg-muted/40"}
                        `}
                        onClick={() => handleModelClick(model.id)}
                      >
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <div className="font-medium text-sm">
                            {model.name ?? model.id}
                          </div>
                          <ModelCapabilitiesIcons model={model} />
                        </div>
                        <div className="text-xs text-muted-foreground space-y-1">
                          <div>
                            <span className="font-semibold">Provider:</span>{" "}
                            {provider}
                          </div>
                          <div>
                            <span className="font-semibold">Input:</span>{" "}
                            {formatPrice(model.pricing?.prompt)} |{" "}
                            <span className="font-semibold">Output:</span>{" "}
                            {formatPrice(model.pricing?.completion)}
                          </div>
                          {model.context_length && (
                            <div>
                              <span className="font-semibold">Context:</span>{" "}
                              {model.context_length.toLocaleString()} tokens
                            </div>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </SimpleBar>
          </div>
        </div>

        <DialogFooter className="flex-shrink-0 mt-4">
          <Button type="button" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
