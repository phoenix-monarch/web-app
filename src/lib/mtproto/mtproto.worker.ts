/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

// just to include
import '../polyfill';

import apiManager from "./apiManager";
import cryptoWorker from "../crypto/cryptoworker";
import networkerFactory from "./networkerFactory";
import apiFileManager from './apiFileManager';
import type { RequestFilePartTask, RequestFilePartTaskResponse } from '../serviceWorker/index.service';
import { ctx } from '../../helpers/userAgent';
import { socketsProxied } from './dcConfigurator';
import { notifyAll } from '../../helpers/context';
// import AppStorage from '../storage';
import CacheStorageController from '../cacheStorage';
import sessionStorage from '../sessionStorage';
import { LocalStorageProxyTask } from '../localStorage';
import { WebpConvertTask } from '../webp/webpWorkerController';

let webpSupported = false;
export const isWebpSupported = () => {
  return webpSupported;
};

networkerFactory.setUpdatesProcessor((obj) => {
  notifyAll({update: obj});
});

networkerFactory.onConnectionStatusChange = (status) => {
  notifyAll({type: 'connectionStatusChange', payload: status});
};

const taskListeners = {
  convertWebp: (task: WebpConvertTask) => {
    const {fileName, bytes} = task.payload;
    const deferred = apiFileManager.webpConvertPromises[fileName];
    if(deferred) {
      deferred.resolve(bytes);
      delete apiFileManager.webpConvertPromises[fileName];
    }
  },

  requestFilePart: async(task: RequestFilePartTask) => {
    const responseTask: RequestFilePartTaskResponse = {
      type: task.type,
      id: task.id
    };

    try {
      const res = await apiFileManager.requestFilePart(...task.payload);
      responseTask.payload = res;
    } catch(err) {
      responseTask.originalPayload = task.payload;
      responseTask.error = err;
    }

    notifyAll(responseTask);
  },

  webpSupport: (task: any) => {
    webpSupported = task.payload;
  },

  socketProxy: (task: any) => {
    const socketTask = task.payload;
    const id = socketTask.id;
    
    const socketProxied = socketsProxied.get(id);
    if(socketTask.type === 'message') {
      socketProxied.dispatchEvent('message', socketTask.payload);
    } else if(socketTask.type === 'open') {
      socketProxied.dispatchEvent('open');
    } else if(socketTask.type === 'close') {
      socketProxied.dispatchEvent('close');
      socketsProxied.delete(id);
    }
  },

  localStorageProxy: (task: LocalStorageProxyTask) => {
    sessionStorage.finishTask(task.id, task.payload);
  },

  userAgent: (task: any) => {
    networkerFactory.userAgent = task.payload;
  }
};

const onMessage = async(e: any) => {
  try {
    const task = e.data;
    const taskId = task.taskId;

    // @ts-ignore
    const f = taskListeners[task.type];
    if(f) {
      f(task);
      return;
    }

    if(!task.task) {
      return;
    }
  
    switch(task.task) {
      case 'computeSRP':
      case 'gzipUncompress':
        // @ts-ignore
        return cryptoWorker[task.task].apply(cryptoWorker, task.args).then(result => {
          notifyAll({taskId, result});
        });
  
      case 'setQueueId':
      case 'cancelDownload':
      case 'uploadFile':
      case 'downloadFile': {
        try {
          // @ts-ignore
          let result = apiFileManager[task.task].apply(apiFileManager, task.args);
  
          if(result instanceof Promise) {
            /* (result as ReturnType<ApiFileManager['downloadFile']>).notify = (progress: {done: number, total: number, offset: number}) => {
              notify({progress: {fileName, ...progress}});
            }; */
            result = await result;
          }
  
          notifyAll({taskId, result});
        } catch(error) {
          notifyAll({taskId, error});
        }

        break;
      }

      case 'getNetworker': {
        // @ts-ignore
        apiManager[task.task].apply(apiManager, task.args).finally(() => {
          notifyAll({taskId, result: null});
        });
        
        break;
      }

      case 'toggleStorage': {
        const enabled = task.args[0];
        // AppStorage.toggleStorage(enabled);
        CacheStorageController.toggleStorage(enabled);
        break;
      }

      case 'setLanguage':
      case 'startAll':
      case 'stopAll': {
        // @ts-ignore
        networkerFactory[task.task].apply(networkerFactory, task.args);
        break;
      }
  
      default: {
        try {
          // @ts-ignore
          let result = apiManager[task.task].apply(apiManager, task.args);
  
          if(result instanceof Promise) {
            result = await result;
          }

          //console.log(notifyAll);
  
          notifyAll({taskId, result});
        } catch(error) {
          notifyAll({taskId, error});
        }
  
        //throw new Error('Unknown task: ' + task.task);
        break;
      }
    }
  } catch(err) {

  }
};

//console.log('[WORKER] Will send ready', Date.now() / 1000);
ctx.addEventListener('message', onMessage);
notifyAll('ready');
