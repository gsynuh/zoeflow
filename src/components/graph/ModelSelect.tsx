"use client";

import { useMemo, useState } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useOpenRouterModelsById } from "@/zoeflow/openrouter/useOpenRouterModels";

export type ModelSelectProps = {
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
};

/**
 * Two-step model selector: first select provider, then select model.
 * Models are grouped by provider (e.g., "openai", "anthropic") based on the "/" separator.
 */
export function ModelSelect({
  value,
  onValueChange,
  disabled = false,
  placeholder = "Select a model...",
}: ModelSelectProps) {
  const modelsById = useOpenRouterModelsById();
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);

  const currentProvider = useMemo(() => {
    if (!value) return null;
    const [provider] = value.split("/", 2);
    return provider?.toLowerCase() ?? null;
  }, [value]);

  const groupedModels = useMemo(() => {
    const groups = new Map<string, Array<{ id: string; name: string }>>();

    Object.values(modelsById).forEach((model) => {
      const [provider, modelName] = model.id.split("/", 2);
      if (!provider || !modelName) return;

      const providerKey = provider.toLowerCase();
      if (!groups.has(providerKey)) {
        groups.set(providerKey, []);
      }

      let cleanName = model.name ?? modelName;
      if (cleanName.includes(":")) {
        const parts = cleanName.split(":");
        cleanName = parts.slice(1).join(":").trim();
      }
      if (!cleanName || cleanName.toLowerCase().startsWith(providerKey)) {
        cleanName = modelName;
      }

      groups.get(providerKey)!.push({
        id: model.id,
        name: cleanName,
      });
    });

    const sortedProviders = Array.from(groups.entries()).sort((a, b) =>
      a[0].localeCompare(b[0]),
    );

    sortedProviders.forEach(([, models]) => {
      models.sort((a, b) => a.name.localeCompare(b.name));
    });

    return sortedProviders;
  }, [modelsById]);

  const providers = useMemo(() => {
    return groupedModels.map(([provider]) => provider);
  }, [groupedModels]);

  const providerModels = useMemo(() => {
    if (!selectedProvider && !currentProvider) return [];
    const provider = selectedProvider ?? currentProvider;
    const group = groupedModels.find(([p]) => p === provider);
    return group?.[1] ?? [];
  }, [selectedProvider, currentProvider, groupedModels]);

  const formatProviderName = (provider: string) => {
    return provider.charAt(0).toUpperCase() + provider.slice(1);
  };

  const handleProviderChange = (provider: string) => {
    setSelectedProvider(provider);
    const group = groupedModels.find(([p]) => p === provider);
    if (group && group[1].length > 0) {
      onValueChange(group[1][0].id);
    } else {
      onValueChange("");
    }
  };

  const handleModelChange = (modelId: string) => {
    onValueChange(modelId);
  };

  const activeProvider = selectedProvider ?? currentProvider;

  return (
    <div className="flex flex-col gap-2">
      <Select
        value={activeProvider ?? ""}
        onValueChange={handleProviderChange}
        disabled={disabled}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Provider...">
            {activeProvider
              ? formatProviderName(activeProvider)
              : "Provider..."}
          </SelectValue>
        </SelectTrigger>
        <SelectContent className="max-h-[300px]">
          {providers.length === 0 ? (
            <SelectItem value="" disabled>
              No providers found
            </SelectItem>
          ) : (
            providers.map((provider) => (
              <SelectItem key={provider} value={provider}>
                {formatProviderName(provider)}
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>

      <Select
        value={value}
        onValueChange={handleModelChange}
        disabled={disabled || !activeProvider}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder={placeholder}>
            {value && modelsById[value]
              ? (() => {
                  const [, modelPart] = value.split("/", 2);
                  const provider = currentProvider ?? "";
                  const group = groupedModels.find(([p]) => p === provider);
                  const model = group?.[1].find((m) => m.id === value);
                  return model?.name ?? modelPart ?? value;
                })()
              : placeholder}
          </SelectValue>
        </SelectTrigger>
        <SelectContent className="max-h-[300px]">
          {providerModels.length === 0 ? (
            <SelectItem value="" disabled>
              {activeProvider ? "No models found" : "Select a provider first"}
            </SelectItem>
          ) : (
            providerModels.map((model) => (
              <SelectItem key={model.id} value={model.id}>
                {model.name}
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
      {value && (
        <div className="text-xs text-muted-foreground">
          Model ID: <code className="font-mono">{value}</code>
        </div>
      )}
    </div>
  );
}
