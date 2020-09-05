import { json } from "overmind";
import { toast } from "react-toastify";
import labeledStream from "../streamutils/labeledStream";
import PeerConnection from "../PeerConnection";
// import VideoStreamMerger from "../streamutils/video-stream-merger";

const actions = {
  onReload({ state, actions }) {
    actions.setTestWindow('video')
    console.log("RUNNING RELOAD TEST", actions === state)
  },
  setTestWindow({ state }, window) {
    state.testWindow = window
  },
  getStream({ state, actions }, name) {
    if (state.streams[name]) {
      return json(state.streams[name])
    } else {
      actions.diag("stream " + name + " can't be found")
    }

  },
  doDemo({ state }) {
    state.componentStatus.recorderDemo = "show"
  },

  setCurrentWindow({ state }, window) {
    state.currentWindow = window
  },
  doAction({ actions }, action) {
    if (typeof action !== 'object') {
      action = { action }
    }
    if (!action.action) {
      action = { action: 'diag', payload: "need an action" }
      return
    }
    actions[action.action](action.payload)
  },
  editor: {
    set({ state }, text) {
      state.directorText = text;
    }
  },
  newConnnectionID({ state }) {
    state.peerData.connectionSequence++;
    return state.attrs.id + '-c-' + state.peerData.connectionSequence;
  },
  createConnection({ state, actions }, { peerID, pc }) {
    const connectionID = actions.newConnnectionID;
    state.peerData.connections[connectionID] = {
      peerID,
      pc
    };
  },
  getConnection({ state }, connectionID) {
    const connection = state.peerData.connections[connectionID];
    if (!connection) throw new Error(`missing connection ${connectionID}`);
    return connection;
  },
  getPeerID({ actions }, connectionID) {
    return actions.getConnection(connectionID).peerID;
  },
  getPeerConnection({ actions }, connectionID) {
    return json(actions.getConnection(connectionID).pc);
  },
  deleteConnection({ state, actions }, connectionID) {
    if (state.peerData.connections[connectionID]) {
      actions.relayAction({ op: 'deleteConnection', to: actions.getPeerID(connectionID), connectionID })
    }
    const peer = actions.getPeerConnection(connectionID)
    peer.stop()
    delete state.peerData.connections[connectionID]
  },

  setMediaDevices({ state }, mediaDevices) {
    state.mediaDevices = mediaDevices
  },
  getMediaDevices({ state }) {
    navigator.mediaDevices.enumerateDevices().then((devices) => {
      const extracts = devices.map((device) => {
        const { kind, deviceId, label } = device
        return { kind, deviceId, label }

      })
      state.mediaDevices = extracts
    })
  },
  changeMedia({ state }) {
    state.changeMedia = !state.changeMedia
  },
  setAppState({ state }, { prop, value }) {
    state.AppState[prop] = value;
  },
  relayAction({ effects }, { to, op, data }) {
    effects.socket.actions.relayEffect(to, op, data);
  },

  startCascade({ state, actions }) {
    console.clear();
    if (state.members.length < 2) {
      actions.setMessage("Can't start a cascade with only you in the room.");
      return;
    }
    actions.startCascaders();
    actions.startControllers();
    actions.startViewers();
  },
  // startChat({ state, actions }) {
  //     state.members.forEach(id => {
  //         actions.relayAction({
  //             to: id,
  //             op: "startChat",
  //             data: { from: state.attrs.id }
  //         });
  //     });
  // },
  endAllStreams({ state, actions }) {
    state.members.forEach(id => {
      actions.relayAction({
        to: id,
        op: "endChat",
        data: { from: state.attrs.id }
      });
    });
  },
  initiatesTo({ state }, member) {
    if (state.attrs.id < member) {
      // actions.diag(state.attrs.id + " initiates to " + member)
      return true
    } else {
      // actions.diag(state.attrs.id + " does not initiate to " + member)
      return false
    }
  },
  leaveRoom({ state, actions }) {
    state.currentWindow = "main"
    actions.setRoomStatus("left")
    actions.endStreams()
  },
  joinRoom({ state, actions }) {
    actions.setRoomStatus('joined')
    state.currentWindow = 'chat'
    actions.connectRoom()
  },
  connectRoom({ state, actions }) {
    if (!state.streams.localStream) {
      diag("local stream not running when trying to connect")
      setTimeout(connectRoom, 1000)
    }
    let allPresent = true
    state.members.map((member) => {
      if (!state.users[member]) {
        allPresent = false
        actions.relayAction({ to: member, op: "getInfo" });
      }
    })
    //If not all present, try again in a minute
    if (!allPresent) setTimeout(() => {
      actions.reconnect()

    }, 1000);
    // console.log("connecting to ", state.members)
    state.members.map((member) => {
      if (!state.users[member]) return
      if (state.users[member].roomStatus !== 'joined') return
      // if (state.users[member].initStatus) return
      const newStream = new MediaStream()
      newStream.streamNumber = state.streamNumber++
      state.users[member].remoteStream = newStream

      if (actions.initiatesTo(member)) {
        state.users[member].initStatus = true
        actions.relayAction({
          to: member,
          op: "startcall",
          data: { initiator: member, responder: state.attrs.id, role: 'chat' }
        });
      }
    });
  },
  endStreams({ state, actions }) {
    console.log("ENDING CHATTERS    ")
    // actions.endCall({ from: state.attrs.id })
    state.members.forEach(id => {
      actions.relayAction({
        to: id,
        op: "end",
        data: { from: state.attrs.id }
      });
      actions.relayAction({
        to: state.attrs.id,
        op: "end",
        data: { from: id }
      });
      // if (state.users[id] && state.users[id].remoteStream) {
      //     const stream = json(state.users[id].remoteStream)
      //     state.users[id].remoteStream = new MediaStream()
      //     stream.getTracks().forEach(track => {
      //         track.stop()
      //         stream.removeTrack(track)
      //     })
      // }
    }
    )

  },
  startCascaders({ state, actions }) {
    state.sessions.cascaders.slice(0, -1).map((member, sequence) => {
      state.nextMember = state.sessions.cascaders[sequence + 1];
      actions.relayAction({
        to: member,
        op: "startcall",
        data: { initiator: member, responder: state.nextMember, role: 'cascade' }
      });
    });
  },
  startControllers({ state, actions }) {
    state.sessions.controllers.map((member) => {
      actions.relayAction({
        to: state.nextMember,
        op: "startcall",
        data: { initiator: state.nextMember, responder: member, role: 'control' }
      });
      state.nextMember = member;
    });
  },
  startViewers({ state, actions }) {
    const nControllers = state.sessions.controllers.length;
    state.sessions.viewers.map((member, sequence) => {
      const controller = state.sessions.controllers[sequence % nControllers];
      actions.relayAction({
        to: controller,
        op: "startcall",
        data: { initiator: controller, responder: member, role: 'view' }
      });
    });
  },
  startCall({ state, actions }, { isCaller, friendID, config, data }) {
    if (!state.streams.localStream || !state.users[friendID]) {
      console.log("Retrying with ", { friendID }, state.streams.localStream, json(state.users[friendID]))
      const retryCall = () => {
        actions.startCall({ isCaller, friendID, config, data })
      }
      setTimeout(retryCall, 1000)
      return
    }
    // actions.setRoomStatus('connecting')
    // if (!state.isCascading) {
    //     actions.setupStreams();
    //     actions.showCallPage();
    // }
    const pc = new PeerConnection(friendID, state);
    state.users[friendID].peerConnection = pc
    state.callInfo[friendID] = {
      pc,
      config,
      isCaller,
      data,
      status: 'connecting'
    };
    pc
      .on('localStream', () => {
      })
      .on('peerTrackEvent', (e) => {
        // const src = e.streams[0]
        // actions.setRoomStatus('connected')
        actions.peerTrackEvent({ friendID, event: e })
      })
      .startPeer(isCaller, config, state);
    pc.pc.oniceconnectionstatechange = () => {
      const message = `Ice connection state change for ${friendID} ${pc.pc.iceConnectionState}`
      actions.diag(message)

    }
    pc.pc.onconnectionstatechange = () => {
      const message = `Connection state change for ${friendID} ${pc.pc.connectionState}`
      actions.diag(message)
      // actions.setConnectionStatus({ id: friendID, status: pc.pc.connectionState })

    }
    return pc;
  },
  setConnectionStatus({ state }, { id, status }) {
    state.users[id].connectionStatus = status

  },
  // showCallPage({ state }) {
  //     if (state.index !== -1) {
  //         //part of cascade
  //         state.currentWindow = "cascade";
  //     } else if (state.attrs.control && (
  //         parseInt(state.attrs.control, 10) ||
  //         state.attrs.control.toLowerCase() === "control" ||
  //         state.attrs.control.toLowerCase() === "viewer"
  //     )
  //     ) {
  //         state.currentWindow = "control";
  //     }
  // },

  // setupStreams({ st`ate, actions }, opts) {
  //   const id = state.attrs.id;
  //   actions.createCasdadeStream();
  // },
  createCascadeStream({ state }) {
    if (!state.streams.cascadeStream) {
      const merger = labeledStream(
        json(state.streams.localStream),
        state.attrs.name,
        state.index,
        state.sessions.cascaders.length
      );
      state.streams.cascadeMerger = merger;
      state.streams.cascadeStream = merger.result;
    }
  },
  endCall({ state, actions }, { isStarter, from }) {
    // actions.clearCascade();
    // actions.setRoomStatus('disconnected')
    actions.setConnectionStatus({ id: from, status: 'disconnected' })
    state.users[from].initStatus = false
    if (state.users[from] && state.users[from].remoteStream) {
      const stream = json(state.users[from].remoteStream)
      state.users[from].remoteStream = null
      stream.getTracks().forEach(track => {
        track.stop()
        stream.removeTrack(track)
      })
    }


    if (state.callInfo[from] && !state.callInfo[from].stopped) {
      const callInfo = json(state.callInfo[from]);
      callInfo.pc.stop(isStarter.from);
      state.callInfo[from] = {
        pc: null,
        stopped: true,
        status: 'disconnected'
      };
    }

  },
  peerTrackEvent({ state, actions }, { friendID, event: e }) {
    state.peerEvents = state.peerEvents + 1
    const src = e.streams[0];
    const stream = json(state.users[friendID].remoteStream)
    actions.setConnectionStatus({ id: friendID, status: 'connected' })
    const tracks = src.getTracks()
    tracks.forEach(track => {
      // console.log("adding a track", track.kind)
      stream.addTrack(track, src)
    })

  },
  // relayAction({ state, effects }, { to, op, data }) {
  //     effects.socket.actions.relayEffect(to, op, data)
  // },
  // startCascade({ state, actions, effects }) {
  //     if (state.members.length < 2) {
  //         actions.setMessage("Can't start a cascade with only you in the room.")
  //         return
  //     }
  //     actions.diag('start cascade')
  //     let nextMember
  //     state.sessions.cascaders.slice(0, -1).map((member, sequence) => {
  //         nextMember = state.sessions.cascaders[sequence + 1]
  //         actions.relayAction({
  //             to: member,
  //             op: "startcall",
  //             data: { responder: nextMember }
  //         })
  //     })
  //     state.sessions.controllers.map((member, sequence) => {

  //         actions.relayAction({
  //             to: nextMember,
  //             op: "startcall",
  //             data: { responder: member }
  //         })
  //         nextMember = member
  //     })
  // },
  clearCascade({ state }) {
    console.log("clear cascade")
    state.currentWindow = "chat";
    delete state.streams.cascadeStream;
    if (state.streams.cascadeMerger) {
      json(state.streams.cascadeMerger).destroy();
      delete state.streams.cascadeMerger;
    }
  },
  broadcastToRoom({ state, effects }, { message, data }) {
    state.members.forEach(id => {
      effects.socket.actions.relay(id, message, data);
    });
  },

  endCascade({ state, actions }) {
    actions.setMessage(`Ending cascade for room '${state.attrs.room}'.`);
    actions.endCall({ from: state.attrs.id })
    state.members.forEach(id => {
      actions.relayAction({
        to: id,
        op: "end",
        data: { from: state.attrs.id }
      });
    });
  },

  deleteUserEntry({ state }, id) {
    const user = state.users[id]
    if (user.remoteStream) {
      const stream = json(user.remoteStream)
      stream.getTracks().forEach(track => {
        track.stop()
        stream.removeTrack(track)
      })
    }
    delete state.users[id]
  },
  fadeUserEntry({ state }, id) {
    const user = state.users[id]
    user.opacity = user.opacity

  },
  setMembers({ state, actions }, data) {
    const inArray = (val, array) => {
      return array.filter(e => e === val);
    };
    const droppedMembers = []
    data.members.forEach(member => {
      if (!inArray(member, state.members) || !state.users[member]) {
        // of user is not in the array then send a
        actions.relayAction({ to: member, op: "getInfo" });
      } else {
        droppedMembers.push(member)
      }
    });
    state.members = data.members;
    droppedMembers.forEach(member => {
      const user = json(state.users[member])
      if (!user) return
      if (user.timeOut) return
      user.timeOut = setTimeout(() => {
        actions.fadeUserEntry(member)
      }, 2000)

    })
    actions.computeCategories();
  },
  computeCategories({ state, actions }) {
    let cascaders = [];
    const controllers = [];
    const viewers = [];
    const members = [];
    const directors = []
    state.members.forEach(key => {
      const user = state.users[key];
      if (!user) return;
      const control = user.control;
      const seq = parseInt(control, 10);
      if (seq) {
        if (!cascaders[seq]) cascaders[seq] = [];
        cascaders[seq].push(key);
      } else if (control) {
        if (control.toLowerCase() === "control") {
          controllers.push(key);
        } else if (control.toLowerCase() === "director") {
          directors.push(key)
        } else if (control.toLowerCase() === "member") {
          members.push(key)
        } else if (control.toLowerCase() === "viewer") {
          viewers.push(key);
        } else {
          console.log("CONTROL iS", control)
          actions.setMessage(
            'Control must be a number, or "control" or "member"'
          );

        }
      }
    });
    cascaders = cascaders.flat().filter(a => a);
    state.allSessions = cascaders.concat(controllers).concat(viewers).concat(members).concat(directors);
    state.sessions = {
      cascaders,
      controllers,
      viewers,
      members,
      directors
    };
    state.index = state.sessions.cascaders.findIndex(e => e === state.attrs.id);
  },
  sendUserInfo({ state, actions }, request) {
    const data = Object.assign(json(state.attrs), request);
    actions.relayAction({ to: request.from, op: "info", data });
  },
  broadcastUserInfo({ state, actions }) {
    state.members.map(member => {
      actions.relayAction({ to: member, op: "info", data: json(state.attrs) });
    })
  },
  toggleReady({ state, actions }) {
    if (state.users[state.attrs.id].status !== 'ready') {
      actions.setRoomStatus('ready')
    } else {
      actions.setRoomStatus('wait!')
    }
    actions.broadcastUserInfo()
  },
  setUserInfo({ state, actions }, data) {
    const id = data.id;
    delete data.id;
    // console.log("got user info for ", id)
    if (!state.users[id]) state.users[id] = {};

    for (const key in data) {
      state.users[id][key] = data[key];
    }
    state.users[id].opacity = 1
    actions.computeCategories();
    if (state.attrs.roomStatus === 'joined') actions.connectRoom()


  },
  setMessage({ state, actions }, value = "default message") {
    // console.log("Setmessage", state)
    state._message.text = value;
    toast(value, {
      position: "top-center",
      autoClose: 4000,
      hideProgressBar: true,
      closeOnClick: true,
      pauseOnHover: true,
      draggable: true,
      progress: undefined
    });
    setTimeout(actions.clearMessage, state._message.delay);
  },
  clearMessage({ state }) {
    state._message.text = "";
  },

  diag({ state }, diag) {
    console.log(diag);
    state.diags.push(diag);
  },


  addStream({ state }, { name, stream }) {
    state.streams[name] = stream;
  },
  addControllerPeer({ state }, src) {
    console.log("Just to avoid an error", state, src)
  },//eslint-disable-line
  addPeerToCascade({ state }, src) {
    const id = state.attrs.id;
    // const control = state.users[id].control;

    state.streams.peerStream = src;

    if (state.sessions.cascaders[0] !== id) {
      const merger = json(state.streams.cascadeMerger);
      merger.addStream(src, {
        index: -1,
        x: 0, // position of the topleft corner
        y: 0,
        width: merger.width,
        height: merger.height
      });
    }
  },
  setupStreams({ state, actions }) {
    // const id = state.attrs.id;
    if (!state.streams.cascadeStream) {
      const merger = labeledStream(
        json(state.streams.localStream),
        state.attrs.name,
        state.index,
        state.sessions.cascaders.length
      );
      actions.addStream({ name: "cascadeMerger", stream: merger });

      actions.addStream({ name: "cascadeStream", stream: merger.result });
    }
  },
  logEvent({ state }, { evType, message, zargs }) {
    const lastEvent = { evType, message, zargs };
    if (message === "ping" || message === "pong") state.lastEvent = lastEvent;
    // state.events.push(lastEvent)
  },
  clearEvents({ state }) {
    state.events = [];
  },
  setRoomStatus({ state, actions }, status) {
    state.attrs.roomStatus = status;
    actions.broadcastUserInfo()
  },

  setAttrs({ state, effects }, attrs) {
    if (!attrs)
      attrs = {
        name: "undefined",
        room: "main",
        role: "undefined",
        control: "undefined",
        id: null
      };
    state.attrs = attrs;
    effects.storage.setAttrs(json(state.attrs));
  },

  setId({ state, effects }, id) {
    state.attrs.id = id;
    effects.storage.setAttrs(json(state.attrs));
  },
  setControl({ state, effects }, control) {
    state.attrs.control = control;
    effects.storage.setAttrs(json(state.attrs));
  },
  register({ state, actions, effects }, data) {
    state.peerEvents++

    let error = false;
    if (data.controlValue !== "undefined") {
      state.attrs.control = data.controlValue;
    } else {
      actions.setMessage("Missing control value");
      error = true;
    }
    if (data.userID !== "undefined") {
      state.attrs.name = data.userID;
    } else {
      actions.setMessage("Missing user name");
      error = true;
    }
    if (data.roomID !== "undefined") {
      state.attrs.room = data.roomID;
    } else {
      actions.setMessage("Missing room name");
      error = true;
    }
    // console.log('registering ', json(state.attrs))
    effects.storage.setAttrs(json(state.attrs));
    if (!error) {
      actions.setRoomStatus('registered')
      if (state.attrs.control === 'director') {
        actions.setCurrentWindow("director")
      }
      actions.broadcastUserInfo()
      effects.socket.actions.register(json(state.attrs));
    }
  }
};
export default actions;
