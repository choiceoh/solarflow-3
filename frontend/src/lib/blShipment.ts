import { fetchWithAuth } from '@/lib/api';

type BLLinePayload = Record<string, unknown>;

interface BLFormPayload extends Record<string, unknown> {
  bl_id?: string;
  lines?: BLLinePayload[];
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : '알 수 없는 오류';
}

export async function saveBLShipmentWithLines(formData: BLFormPayload): Promise<string> {
  const { lines, bl_id: existingId, ...blData } = formData;
  const nextLines = Array.isArray(lines) ? lines : [];
  let blId: string;

  if (existingId) {
    await fetchWithAuth(`/api/v1/bls/${existingId}`, {
      method: 'PUT',
      body: JSON.stringify(blData),
    });
    blId = existingId;
  } else {
    const created = await fetchWithAuth<{ bl_id: string }>('/api/v1/bls', {
      method: 'POST',
      body: JSON.stringify(blData),
    });
    blId = created.bl_id;
  }

  const failures: string[] = [];

  if (existingId) {
    const existing = await fetchWithAuth<{ bl_line_id: string }[]>(`/api/v1/bls/${blId}/lines`);
    for (const el of existing) {
      try {
        await fetchWithAuth(`/api/v1/bls/${blId}/lines/${el.bl_line_id}`, { method: 'DELETE' });
      } catch (err) {
        failures.push(`기존 품목 삭제 실패(${el.bl_line_id.slice(0, 8)}): ${errorMessage(err)}`);
      }
    }
  }

  if (failures.length > 0) {
    throw new Error(failures.join('\n'));
  }

  for (const [idx, line] of nextLines.entries()) {
    try {
      await fetchWithAuth(`/api/v1/bls/${blId}/lines`, {
        method: 'POST',
        body: JSON.stringify({ ...line, bl_id: blId }),
      });
    } catch (err) {
      failures.push(`품목 ${idx + 1} 등록 실패: ${errorMessage(err)}`);
    }
  }

  if (failures.length > 0) {
    throw new Error(failures.join('\n'));
  }

  return blId;
}
