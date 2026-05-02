// Rail 탭 — 사이드 패널 블록. blockId(등록된 블록 키) + props(JSON 객체).
// props는 블록마다 시그니처가 달라서 JSON 텍스트로 편집.

import { useMemo } from 'react';
import type { ListScreenConfig, RailBlockConfig } from '@/templates/types';
import { railBlocks } from '@/templates/registry';
import { ArrayEditor, FieldSelect, moveInArray } from './ArrayEditor';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

export function RailTab({
  value, onChange,
}: {
  value: ListScreenConfig;
  onChange: (next: ListScreenConfig) => void;
}) {
  const rail = value.rail ?? [];

  const blockOptions = useMemo(
    () => Object.keys(railBlocks).sort().map((id) => ({ value: id, label: id })),
    [],
  );

  const update = (idx: number, next: RailBlockConfig) =>
    onChange({ ...value, rail: rail.map((b, i) => (i === idx ? next : b)) });

  return (
    <ArrayEditor
      items={rail}
      hint="우측 사이드 패널에 위에서 아래로 표시. blockId는 registry.railBlocks 키, props는 블록별 인자."
      addLabel="Rail 블록 추가"
      emptyMsg="Rail 블록이 없습니다 (사이드 패널이 숨겨집니다)"
      onAdd={() => onChange({
        ...value,
        rail: [...rail, { blockId: blockOptions[0]?.value ?? '', props: {} }],
      })}
      onMove={(idx, dir) => onChange({ ...value, rail: moveInArray(rail, idx, dir) })}
      onRemove={(idx) => onChange({ ...value, rail: rail.filter((_, i) => i !== idx) })}
      renderRow={(b, idx) => {
        const propsText = JSON.stringify(b.props ?? {}, null, 2);
        return (
          <div className="space-y-2">
            <FieldSelect label="blockId (registry.railBlocks)" value={b.blockId} options={blockOptions}
              onChange={(v) => update(idx, { ...b, blockId: v })} />

            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">
                props (JSON 객체 — 블록별 시그니처는 registry.railBlocks 정의 참조)
              </Label>
              <Textarea
                className="font-mono text-xs"
                rows={6}
                value={propsText}
                onChange={(e) => {
                  // parse 실패해도 일단 raw 보존. apply 시 부모에서 검증.
                  try {
                    const parsed = JSON.parse(e.target.value);
                    update(idx, { ...b, props: parsed });
                  } catch {
                    // invalid JSON — keep current props (편집 중인 텍스트는 textarea state에만)
                    // 사용자가 명시적으로 fix해야 함. 다른 행 클릭 시 잃어버림 — 의도된 단순함
                  }
                }}
              />
            </div>
          </div>
        );
      }}
    />
  );
}
