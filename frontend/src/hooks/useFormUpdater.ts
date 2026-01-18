import { useCallback, Dispatch, SetStateAction } from 'react';

/**
 * 메모이제이션된 폼 필드 업데이터 생성 커스텀 훅
 * 매 렌더링마다 새 함수 생성 방지
 */
export function useFormUpdater<T>(setFormData: Dispatch<SetStateAction<T>>) {
  return useCallback(
    <K extends keyof T>(field: K, value: T[K]) => {
      setFormData(prev => ({ ...prev, [field]: value }));
    },
    [setFormData]
  );
}

/**
 * 타입 안전한 폼 필드 변경 핸들러 생성 훅
 */
export function useFieldChangeHandler<T>(
  setFormData: Dispatch<SetStateAction<T>>,
  field: keyof T
) {
  return useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      const value = e.target.type === 'number' ? Number(e.target.value) : e.target.value;
      setFormData(prev => ({ ...prev, [field]: value }));
    },
    [setFormData, field]
  );
}
