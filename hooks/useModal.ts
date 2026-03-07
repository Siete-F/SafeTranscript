import { useState } from 'react';

export type ModalType = 'success' | 'error' | 'info' | 'confirm' | 'warning';

export interface ModalState {
  visible: boolean;
  title: string;
  message: string;
  type: ModalType;
}

const INITIAL_STATE: ModalState = {
  visible: false,
  title: '',
  message: '',
  type: 'info',
};

export function useModal() {
  const [modal, setModal] = useState<ModalState>(INITIAL_STATE);

  const showModal = (title: string, message: string, type: ModalType = 'info') => {
    setModal({ visible: true, title, message, type });
  };

  const hideModal = () => {
    setModal((prev) => ({ ...prev, visible: false }));
  };

  return { modal, setModal, showModal, hideModal };
}
