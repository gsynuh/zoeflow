"use client";

import type { Node } from "@xyflow/react";
import type { ChangeEvent } from "react";
import { useCallback, useState } from "react";

import { ModelSelect } from "@/components/graph/ModelSelect";
import { TextEditDialog } from "@/components/graph/TextEditDialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NumberInput } from "@/components/ui/number-input";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { formatNumber, formatUsd } from "@/lib/format";
import { getUsdPerToken } from "@/zoeflow/openrouter/pricing";
import { useOpenRouterModelsById } from "@/zoeflow/openrouter/useOpenRouterModels";
import {
  ZoeAttributeKind,
  ZoeNodeID,
  type ZoeAttributeDefinition,
  type ZoeNodeData,
  type ZoeNodeDataPatch,
  type ZoeNodeDefinitionUnion,
} from "@/zoeflow/types";
import { Pencil, Play } from "lucide-react";
import { GraphInspector } from "./GraphInspector";

export type NodeInspectorProps = {
  node: Node<ZoeNodeData> | null;
  definition: ZoeNodeDefinitionUnion | null;
  onUpdateData: (patch: ZoeNodeDataPatch) => void;
  onTestRag?: () => void;
  graphVars?: Record<string, unknown>;
  onUpdateGraphVars?: (vars: Record<string, unknown>) => void;
};

/**
 * Render the inspector panel for a selected node.
 */
export function NodeInspector({
  node,
  definition,
  onUpdateData,
  onTestRag,
  graphVars = {},
  onUpdateGraphVars,
}: NodeInspectorProps) {
  if (!node || !definition) {
    return (
      <GraphInspector
        vars={graphVars}
        onUpdateVars={onUpdateGraphVars ?? (() => {})}
      />
    );
  }

  const attributes = (
    definition.attributes as Array<ZoeAttributeDefinition<ZoeNodeData>>
  ).filter((attribute) => isAttributeExposed(attribute, node.data));

  const isRagNode = node.data.type === ZoeNodeID.Rag;

  return (
    <div className="grid gap-4 mb-5">
      <div className="grid gap-1 pb-2 border-b">
        <div className="text-l font-semibold">{node.data.title} node</div>
      </div>

      {isRagNode && onTestRag && (
        <div>
          <Button
            type="button"
            variant="outline"
            onClick={onTestRag}
            className="w-full"
          >
            <Play className="h-4 w-4" />
            Test RAG Node
          </Button>
        </div>
      )}
      {attributes.map((attribute) => (
        <AttributeField
          key={attribute.key}
          attribute={attribute}
          value={node.data[attribute.key]}
          onUpdate={onUpdateData}
        />
      ))}
    </div>
  );
}

/**
 * Decide whether an attribute should be visible for the current node data.
 */
function isAttributeExposed(
  attribute: ZoeAttributeDefinition<ZoeNodeData>,
  data: ZoeNodeData,
) {
  if (typeof attribute.exposed === "function") {
    return attribute.exposed(data);
  }
  return attribute.exposed !== false;
}

type AttributeFieldProps = {
  attribute: ZoeAttributeDefinition<ZoeNodeData>;
  value: ZoeNodeData[keyof ZoeNodeData];
  onUpdate: (patch: ZoeNodeDataPatch) => void;
};

/**
 * Render a single attribute field based on its definition.
 */
function AttributeField({ attribute, value, onUpdate }: AttributeFieldProps) {
  const inputId = `node-${attribute.key}`;
  const isEditable = attribute.editable !== false;

  const updateValue = (next: unknown) => {
    if ((attribute.key as string) === "toolKey" && next === ZoeNodeID.Rag) {
      onUpdate({ toolKey: next } as Partial<ZoeNodeData>);
      return;
    }

    onUpdate({ [attribute.key]: next } as Partial<ZoeNodeData>);
  };

  const onTextChange = (event: ChangeEvent<HTMLInputElement>) => {
    updateValue(event.currentTarget.value);
  };

  return (
    <div className="grid gap-2">
      {attribute.kind === ZoeAttributeKind.Toggle ? (
        <>
          <div className="flex items-center space-x-2">
            <Checkbox
              id={inputId}
              checked={Boolean(value)}
              onCheckedChange={(checked) => updateValue(checked)}
              disabled={!isEditable}
            />
            <Label
              htmlFor={inputId}
              className="text-sm font-normal leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
            >
              {attribute.label}
            </Label>
          </div>
          {attribute.description ? (
            <div className="text-xs text-muted-foreground pl-6">
              {attribute.description}
            </div>
          ) : null}
        </>
      ) : (
        <>
          <Label htmlFor={inputId}>{attribute.label}</Label>
          {String(attribute.key) === "temperature" &&
          attribute.kind === ZoeAttributeKind.Number ? (
            <div className="flex items-center gap-3">
              <input
                type="number"
                className="flex h-9 w-12 items-center justify-end rounded-md border border-input bg-background px-2 text-right text-sm font-medium tabular-nums shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-moz-appearance:textfield]"
                style={{ MozAppearance: "textfield" }}
                value={typeof value === "number" ? value : 0}
                onChange={(event) => {
                  const next = Number(event.currentTarget.value);
                  if (Number.isFinite(next)) {
                    const min = attribute.min ?? 0;
                    const max = attribute.max ?? 2;
                    const clamped = Math.max(min, Math.min(max, next));
                    updateValue(clamped);
                  }
                }}
                min={attribute.min ?? 0}
                max={attribute.max ?? 2}
                step={0.1}
                disabled={!isEditable}
              />
              <div className="flex-1 space-y-1">
                <Slider
                  value={[typeof value === "number" ? value : 0]}
                  onValueChange={(values) => updateValue(values[0])}
                  min={attribute.min ?? 0}
                  max={attribute.max ?? 2}
                  step={0.1}
                  disabled={!isEditable}
                  className="w-full"
                />
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{attribute.min ?? 0}</span>
                  <span>{attribute.max ?? 2}</span>
                </div>
              </div>
            </div>
          ) : String(attribute.key) === "minScore" &&
            attribute.kind === ZoeAttributeKind.Number ? (
            <div className="flex items-center gap-3">
              <input
                type="number"
                className="flex h-9 w-16 items-center justify-end rounded-md border border-input bg-background px-2 text-right text-sm font-medium tabular-nums shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-moz-appearance:textfield]"
                style={{ MozAppearance: "textfield" }}
                value={typeof value === "number" ? value : 0.6}
                onChange={(event) => {
                  const next = Number(event.currentTarget.value);
                  if (Number.isFinite(next)) {
                    const clamped = Math.max(0, Math.min(1, next));
                    updateValue(clamped);
                  }
                }}
                min={0}
                max={1}
                step={0.01}
                disabled={!isEditable}
              />
              <div className="flex-1 space-y-1">
                <Slider
                  value={[typeof value === "number" ? value : 0.6]}
                  onValueChange={(values) => updateValue(values[0])}
                  min={0}
                  max={1}
                  step={0.01}
                  disabled={!isEditable}
                  className="w-full"
                />
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>0</span>
                  <span>1</span>
                </div>
              </div>
            </div>
          ) : attribute.kind === ZoeAttributeKind.Number ? (
            <NumberInput
              id={inputId}
              min={attribute.min}
              max={attribute.max}
              value={typeof value === "number" ? value : 0}
              onValueChange={updateValue}
              disabled={!isEditable}
            />
          ) : attribute.kind === ZoeAttributeKind.Select ? (
            <select
              id={inputId}
              className="rounded-md border bg-background px-2 py-1 text-sm"
              value={typeof value === "string" ? value : ""}
              onChange={(event) => updateValue(event.currentTarget.value)}
              disabled={!isEditable}
            >
              {(attribute.options ?? []).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          ) : attribute.multiline ||
            attribute.kind === ZoeAttributeKind.Json ? (
            <TextAttributeField
              attribute={attribute}
              value={typeof value === "string" ? value : ""}
              onUpdate={updateValue}
              disabled={!isEditable}
            />
          ) : String(attribute.key) === "model" ? (
            <ModelField
              value={typeof value === "string" ? value : ""}
              onValueChange={updateValue}
              disabled={!isEditable}
              placeholder={attribute.placeholder}
            />
          ) : (
            <Input
              id={inputId}
              type="text"
              placeholder={attribute.placeholder}
              value={typeof value === "string" ? value : ""}
              onChange={onTextChange}
              disabled={!isEditable}
            />
          )}
          {attribute.description ? (
            <div className="text-xs text-muted-foreground">
              {attribute.description}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

type TextAttributeFieldProps = {
  attribute: ZoeAttributeDefinition<ZoeNodeData>;
  value: string;
  onUpdate: (value: unknown) => void;
  disabled?: boolean;
};

/**
 * Render a text attribute field with an edit button that opens a dialog.
 */
function TextAttributeField({
  attribute,
  value,
  onUpdate,
  disabled = false,
}: TextAttributeFieldProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogNonce, setDialogNonce] = useState(0);

  const handleSave = useCallback(
    (newValue: string) => {
      onUpdate(newValue);
    },
    [onUpdate],
  );

  return (
    <>
      <div className="flex items-start gap-2">
        <Textarea
          id={`node-${attribute.key}`}
          placeholder={attribute.placeholder}
          value={value}
          onChange={(e) => onUpdate(e.target.value)}
          disabled={disabled}
          className="flex-1 min-h-[80px]"
          readOnly
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setDialogNonce((current) => current + 1);
            setDialogOpen(true);
          }}
          disabled={disabled}
          className="mt-0.5"
          aria-label={`Edit ${attribute.label}`}
        >
          <Pencil className="h-4 w-4" />
        </Button>
      </div>
      <TextEditDialog
        key={dialogNonce}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={`Edit ${attribute.label}`}
        description={attribute.description}
        label={attribute.label}
        value={value}
        onSave={handleSave}
        placeholder={attribute.placeholder}
      />
    </>
  );
}

type ModelFieldProps = {
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
};

/**
 * Render the model select field with additional model metadata (context length and cost).
 */
function ModelField({
  value,
  onValueChange,
  disabled = false,
  placeholder,
}: ModelFieldProps) {
  const modelsById = useOpenRouterModelsById();
  const model = value ? modelsById[value] : null;

  const contextLength = model?.context_length;
  const promptCostPerToken = getUsdPerToken(model?.pricing, "prompt");
  const completionCostPerToken = getUsdPerToken(model?.pricing, "completion");

  return (
    <div className="space-y-2">
      <ModelSelect
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        placeholder={placeholder}
      />
      {model && (
        <div className="space-y-1 text-xs text-muted-foreground">
          {contextLength !== undefined && (
            <div>Max context: {formatNumber(contextLength)} tokens</div>
          )}
          {(promptCostPerToken !== null || completionCostPerToken !== null) && (
            <div>
              Cost:{" "}
              {promptCostPerToken !== null && (
                <span>
                  {formatUsd(promptCostPerToken * 1000)}/1K input
                  {completionCostPerToken !== null && " • "}
                </span>
              )}
              {completionCostPerToken !== null && (
                <span>
                  {formatUsd(completionCostPerToken * 1000)}/1K output
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
