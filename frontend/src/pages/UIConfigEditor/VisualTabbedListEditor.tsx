// TabbedListConfig 시각 편집기 — 페이지 헤더·탭 메타데이터(key/label/aboveTable) 편집.
// Phase 4 follow-up #3: 각 탭의 내부 ListScreenConfig 도 시각 편집 (recursive
// VisualScreenEditorBody) — 더 이상 JSON sub-textarea 강제 안 함.

import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import type { TabbedListConfig } from '@/templates/types';
import { contentBlocks } from '@/templates/registry';
import { ArrayEditor, FieldInput, FieldSelect, TabButton, moveInArray } from './ArrayEditor';
import { EditorWithPanel, PanelGroup, PanelEmpty } from './RightPanel';
import { VisualScreenEditorBody } from './VisualScreenEditor';

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
  // Follow-up #3: 탭의 내부 list 를 시각 편집 중일 때 그 탭 idx (null = 일반 모드)
  const [editingListIdx, setEditingListIdx] = useState<number | null>(null);
  const tabs = value.tabs ?? [];

  // 내부 list 편집 모드 — 좌측 본체를 그 탭의 list 시각 편집기로 전환
  if (editingListIdx !== null && tabs[editingListIdx]) {
    const editingTab = tabs[editingListIdx];
    return (
      <EditorWithPanel
        panel={
          <>
            <PanelGroup title="내부 list 편집 중">
              <p className="text-xs text-muted-foreground">
                탭 <span className="font-mono font-semibold">{editingTab.key}</span> ·
                {' '}{editingTab.label}
              </p>
              <p className="text-xs text-muted-foreground">
                컬럼 행 ⚙ 클릭은 이 좁은 패널에서는 동작 안 함 (탭 list 편집은 단순 모드).
                상세 편집은 "← 돌아가기" 후 JSON 탭에서.
              </p>
            </PanelGroup>
            <PanelEmpty message="이 탭의 list 만 편집 중. 탭 묶음 정보는 ← 돌아가서." />
          </>
        }
        panelTitle={`⚙ ${editingTab.label} list 편집`}
      >
        <div className="flex flex-col h-full min-h-0">
          <div className="flex items-center gap-2 border-b bg-muted/20 px-3 py-1.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setEditingListIdx(null)}
            >
              <ArrowLeft className="h-3 w-3 mr-1" />
              탭 묶음으로 돌아가기
            </Button>
            <span className="text-xs text-muted-foreground">
              · 편집 중: <span className="font-mono">{editingTab.key}</span>
            </span>
          </div>
          <div className="flex-1 min-h-0">
            <VisualScreenEditorBody
              value={editingTab.list}
              onChange={(nextList) => {
                onChange({
                  ...value,
                  tabs: tabs.map((t, i) => i === editingListIdx ? { ...t, list: nextList } : t),
                });
              }}
              jsonDraft={JSON.stringify(editingTab.list, null, 2)}
              onJsonDraftChange={(json) => {
                try {
                  const parsed = JSON.parse(json);
                  onChange({
                    ...value,
                    tabs: tabs.map((t, i) => i === editingListIdx ? { ...t, list: parsed } : t),
                  });
                } catch {
                  // invalid JSON — wait for user fix
                }
              }}
            />
          </div>
        </div>
      </EditorWithPanel>
    );
  }

  // 일반 모드 (탭 묶음 편집)
  const main = (
    <div className="flex flex-col h-full min-h-0">
      <div className="border-b px-3 flex gap-1 overflow-x-auto">
        <TabButton active={tab === 'basic'} onClick={() => setTab('basic')}>기본 정보</TabButton>
        <TabButton active={tab === 'tabs'} onClick={() => setTab('tabs')}>
          탭 ({tabs.length})
        </TabButton>
        <TabButton active={tab === 'json'} onClick={() => setTab('json')}>JSON (고급)</TabButton>
      </div>

      <div className="flex-1 min-h-0 overflow-auto p-4">
        {tab === 'basic' && <BasicTab value={value} onChange={onChange} />}
        {tab === 'tabs' && (
          <TabsTab
            value={value}
            onChange={onChange}
            onEditList={(idx) => setEditingListIdx(idx)}
          />
        )}
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
            <p className="text-xs text-muted-foreground">
              탭 묶음 — 각 탭의 list 는 행의 "list 시각 편집" 버튼으로 진입.
            </p>
          </PanelGroup>
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
      <p className="text-xs text-muted-foreground">
        공통 메트릭·Rail 편집은 JSON 탭에서. 같은 패턴으로 별도 탭 가능 (follow-up).
      </p>
    </div>
  );
}

function TabsTab({ value, onChange, onEditList }: {
  value: TabbedListConfig;
  onChange: (next: TabbedListConfig) => void;
  onEditList: (idx: number) => void;
}) {
  const tabs = value.tabs ?? [];
  const blockOptions = Object.keys(contentBlocks).sort().map((id) => ({ value: id, label: id }));

  return (
    <ArrayEditor
      items={tabs}
      hint="각 탭의 key/label 은 여기서, list 시각 편집은 행의 [list 편집 →] 버튼으로."
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
      onReorder={(next) => onChange({ ...value, tabs: next })}
      onDuplicate={(idx) => {
        const src = tabs[idx];
        const baseKey = src.key || 'tab';
        let n = 2;
        while (tabs.some((t) => t.key === `${baseKey}_${n}`)) n++;
        const newKey = `${baseKey}_${n}`;
        // list.id 도 충돌 회피
        const listIdBase = src.list.id || `${value.id}_${newKey}`;
        let listN = 2;
        const existingListIds = new Set(tabs.map((t) => t.list.id));
        let newListId = `${listIdBase}_copy`;
        while (existingListIds.has(newListId)) { newListId = `${listIdBase}_copy${listN}`; listN++; }
        const cloned = {
          ...src,
          key: newKey,
          label: `${src.label} (복사)`,
          list: { ...src.list, id: newListId },
        };
        onChange({ ...value, tabs: [...tabs.slice(0, idx + 1), cloned, ...tabs.slice(idx + 1)] });
      }}
      renderRow={(t, idx) => {
        const update = (next: typeof t) =>
          onChange({ ...value, tabs: tabs.map((x, i) => (i === idx ? next : x)) });
        const cols = t.list.columns?.length ?? 0;
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
            <div className="flex items-center justify-between rounded border bg-muted/20 px-3 py-2">
              <div className="text-xs text-muted-foreground">
                <span className="font-mono">{t.list.id}</span>
                {' · '}컬럼 {cols}개
                {' · '}메트릭 {t.list.metrics?.length ?? 0}
                {' · '}필터 {t.list.filters?.length ?? 0}
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => onEditList(idx)}
              >
                list 시각 편집 →
              </Button>
            </div>
          </div>
        );
      }}
    />
  );
}
