// TabbedListConfig 시각 편집기 — 페이지 헤더·탭 메타데이터(key/label/aboveTable) 편집.
// 각 탭의 내부 ListScreenConfig는 JSON sub-textarea (recursive 시각 편집은 follow-up).

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import type { TabbedListConfig } from '@/templates/types';
import { contentBlocks } from '@/templates/registry';
import { ArrayEditor, FieldInput, FieldSelect, TabButton, moveInArray } from './ArrayEditor';
import { EditorWithPanel, PanelGroup, PanelEmpty } from './RightPanel';

type Tab = 'basic' | 'tabs' | 'json';

export interface VisualTabbedListEditorProps {
  value: TabbedListConfig;
  onChange: (next: TabbedListConfig) => void;
  jsonDraft: string;
  onJsonDraftChange: (next: string) => void;
}

export default function VisualTabbedListEditor({
  value, onChange, jsonDraft, onJsonDraftChange,
}: VisualTabbedListEditorProps) {
  const [tab, setTab] = useState<Tab>('basic');

  const main = (
    <div className="flex flex-col h-full min-h-0">
      <div className="border-b px-3 flex gap-1 overflow-x-auto">
        <TabButton active={tab === 'basic'} onClick={() => setTab('basic')}>기본 정보</TabButton>
        <TabButton active={tab === 'tabs'} onClick={() => setTab('tabs')}>
          탭 ({(value.tabs ?? []).length})
        </TabButton>
        <TabButton active={tab === 'json'} onClick={() => setTab('json')}>JSON (고급)</TabButton>
      </div>

      <div className="flex-1 min-h-0 overflow-auto p-4">
        {tab === 'basic' && <BasicTab value={value} onChange={onChange} />}
        {tab === 'tabs' && <TabsTab value={value} onChange={onChange} />}
        {tab === 'json' && (
          <Textarea
            value={jsonDraft}
            onChange={(e) => onJsonDraftChange(e.target.value)}
            className="font-mono text-xs h-full min-h-[400px] resize-none"
            spellCheck={false}
          />
        )}
      </div>
    </div>
  );

  return (
    <EditorWithPanel
      panel={
        <>
          <PanelGroup title="TabbedList 정보">
            <p className="text-[11px] text-muted-foreground">
              탭 묶음 — 각 탭의 list (pagination/inlineEdit/savedViews 등) 는
              해당 list 의 JSON 영역에서 편집.
            </p>
          </PanelGroup>
          <PanelEmpty message="탭별 list 의 시각 편집은 follow-up (recursive editor)" />
        </>
      }
      panelTitle="⚙ 탭 묶음 화면 설정"
    >
      {main}
    </EditorWithPanel>
  );
}

function BasicTab({ value, onChange }: { value: TabbedListConfig; onChange: (next: TabbedListConfig) => void }) {
  const page = value.page ?? { eyebrow: '', title: '', description: '' };
  return (
    <div className="max-w-2xl space-y-4">
      <div className="space-y-1.5">
        <Label className="text-xs">id <span className="text-muted-foreground">(불변)</span></Label>
        <Input value={value.id ?? ''} disabled className="font-mono text-xs bg-muted" />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">eyebrow</Label>
        <Input value={page.eyebrow}
          onChange={(e) => onChange({ ...value, page: { ...page, eyebrow: e.target.value } })} />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">title</Label>
        <Input value={page.title}
          onChange={(e) => onChange({ ...value, page: { ...page, title: e.target.value } })} />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">description</Label>
        <Textarea rows={2} value={page.description}
          onChange={(e) => onChange({ ...value, page: { ...page, description: e.target.value } })} />
      </div>
      <p className="text-[11px] text-muted-foreground">
        공통 메트릭·Rail 편집은 JSON 탭에서. 같은 패턴으로 별도 탭 가능 (follow-up).
      </p>
    </div>
  );
}

function TabsTab({ value, onChange }: { value: TabbedListConfig; onChange: (next: TabbedListConfig) => void }) {
  const tabs = value.tabs ?? [];
  const blockOptions = Object.keys(contentBlocks).sort().map((id) => ({ value: id, label: id }));

  return (
    <ArrayEditor
      items={tabs}
      hint="각 탭의 key/label은 여기서, 내부 list 구성은 JSON 탭에서 편집. 새 탭은 빈 list로 추가됨."
      addLabel="탭 추가"
      emptyMsg="탭이 없습니다"
      rowKey={(_, i) => `${i}-${tabs[i].key}`}
      onAdd={() => onChange({
        ...value,
        tabs: [...tabs, {
          key: `tab_${tabs.length + 1}`,
          label: '새 탭',
          list: {
            id: `${value.id}_${tabs.length + 1}`,
            page: { eyebrow: '', title: '', description: '' },
            source: { hookId: '' },
            filters: [],
            metrics: [],
            columns: [],
          },
        }],
      })}
      onMove={(idx, dir) => onChange({ ...value, tabs: moveInArray(tabs, idx, dir) })}
      onRemove={(idx) => onChange({ ...value, tabs: tabs.filter((_, i) => i !== idx) })}
      renderRow={(t, idx) => {
        const update = (next: typeof t) =>
          onChange({ ...value, tabs: tabs.map((x, i) => (i === idx ? next : x)) });
        const innerListJson = JSON.stringify(t.list, null, 2);
        return (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <FieldInput label="key (탭 식별자)" value={t.key} mono
                onChange={(v) => update({ ...t, key: v })} />
              <FieldInput label="label (탭 버튼 텍스트)" value={t.label}
                onChange={(v) => update({ ...t, label: v })} />
              <FieldSelect label="aboveTable.blockId (탭 위 콘텐츠 블록)"
                value={t.aboveTable?.blockId ?? ''} allowEmpty options={blockOptions}
                onChange={(v) => update({
                  ...t,
                  aboveTable: v ? { blockId: v, props: t.aboveTable?.props } : undefined,
                })} />
              <div />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">
                내부 list (ListScreenConfig — 깊은 편집은 별도 단계, JSON 직편)
              </Label>
              <Textarea
                className="font-mono text-[10px]"
                rows={5}
                value={innerListJson}
                onChange={(e) => {
                  try {
                    update({ ...t, list: JSON.parse(e.target.value) });
                  } catch {
                    // invalid — 사용자 수정 대기
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
