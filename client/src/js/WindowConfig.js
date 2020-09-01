import React from 'react';
import { ToastContainer } from 'react-toastify';
import MainWindow from './MainWindow';
import CascadeWindow from './CascadeWindow';
import ControlRoomWindow from './ControlRoomWindow';
import DirectorPage from './DirectorPage';
import { useApp } from './app';


const WindowConfig = ({ startCallHandler }) => {
  const { state, actions } = useApp();
  const currentWindow = (startCallHandler) => {
    switch (state.currentWindow) {
      // switch ('main') {
      case 'main':
      case 'chat':
        return (
          <MainWindow
            clientId={ state.attrs.id }
            startCall={ startCallHandler }
          />
        );
      case 'cascade':
        return <CascadeWindow />;
      case 'control':
        return <ControlRoomWindow />;
      case 'director':
        return <DirectorPage />;
      default:
        return null;
    }
  };

  return (
    <>
      <ToastContainer />
      { currentWindow() }

    </>

  );
};
export default WindowConfig;
