/*
10:16 PM 영직이 혹시 구현하면서
10:16 PM 영직이 페이로드 시그널링으로 보낼 때
10:16 PM 영직이 밑에 json 포맷으로 페이로드 로그좀 찍어줘
DialPayload { calleeId = "..." } 이런식으로
 */

'use strict';
const createRoomButton = document.querySelector('button#createRoom');
const awakenButton = document.querySelector('button#awaken');
const hangupButton = document.querySelector('button#hangup');

createRoomButton.onclick = createRoom;
awakenButton.onclick = awakenAndAceept;
hangupButton.onclick = hangup;

const server = document.querySelector('div#server input');
const callerIdInput = document.querySelector('div#callerId input');
const calleeIdInput = document.querySelector('div#calleeId input');
const minWidthInput = document.querySelector('div#minWidth input');
const maxWidthInput = document.querySelector('div#maxWidth input');
const minHeightInput = document.querySelector('div#minHeight input');
const maxHeightInput = document.querySelector('div#maxHeight input');
const minFramerateInput = document.querySelector('div#minFramerate input');
const maxFramerateInput = document.querySelector('div#maxFramerate input');

server.onchange = callerIdInput.onchange =
    calleeIdInput.onchange = setLocalStorageItem;

minWidthInput.onchange = maxWidthInput.onchange =
    minHeightInput.onchange = maxHeightInput.onchange =
        minFramerateInput.onchange = maxFramerateInput.onchange = displayRangeValue;

const getUserMediaConstraintsDiv = document.querySelector('div#getUserMediaConstraints');
const bitrateDiv = document.querySelector('div#bitrate');
const peerDiv = document.querySelector('div#peer');
const senderStatsDiv = document.querySelector('div#senderStats');
const receiverStatsDiv = document.querySelector('div#receiverStats');

const localVideo = document.querySelector('div#localVideo video');
const remoteVideos = {};
const remoteVideosDiv = document.querySelector('div#remoteVideos');

const localVideoStatsDiv = document.querySelector('div#localVideo div');
const remoteVideoStatsDiv = document.querySelector('div#remoteVideo div');

function setLocalStorageItem(e) {
    const id = e.target.parentElement.getAttribute('id');
    localStorage.setItem(id, e.target.value);
}

function applyLocalStorageItems() {
    for(let key in localStorage) {
        const value = localStorage.getItem(key);
        const targetElement = document.querySelector('div#' + key);
        if(targetElement){
            const inputTag = targetElement.getElementsByTagName('input');
            if(inputTag.length > 0)
                inputTag[0].value = value;
        }
    }
}

// const pcConfig = {
//     'iceServers': [{
//         urls: 'stun:stun.l.google.com:19302'
//     },
//     {
//         urls: 'turn:numb.viagenie.ca',
//         credential: 'muazkh',
//         username: 'webrtc@live.com',
//     }]
// };
const pcConfig = {
    'iceServers': [{
        urls: 'stun:54.180.24.195:3478',
        credential: 'boyj',
        username: 'boyj',
    },
    {
        urls: 'stun:13.125.215.141:3478',
        credential: 'boyj',
        username: 'boyj',
    }]
};


const CREATE_ROOM = 'CREATE_ROOM';
const DIAL = 'DIAL';
const AWAKEN = 'AWAKEN';
const ACCEPT = 'ACCEPT';
const PARTICIPANTS = 'PARTICIPANTS';
const OFFER = 'OFFER';
const RELAY_OFFER = 'RELAY_OFFER';
const ANSWER = 'ANSWER';
const RELAY_ANSWER = 'RELAY_ANSWER';
const SEND_ICE_CANDIDATE = 'SEND_ICE_CANDIDATE';
const RELAY_ICE_CANDIDATE = 'RELAY_ICE_CANDIDATE';
const END_OF_CALL = 'END_OF_CALL';
const NOTIFY_END_OF_CALL = 'NOTIFY_END_OF_CALL';

let isCaller = false;

let peerConnections = {};
let receiverValue;
let senderValue;
let localStream;
let localDescription;
let bytesPrev;
let timestampPrev;
let socket;

// 참고 : https://stackoverflow.com/questions/105034/create-guid-uuid-in-javascript
function uuidv4() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}
function makeEventLog(eventName, payload){
    let output = eventName;
    output += '/ ';
    for(let key in payload){
        output += key;
        output += " : ";
        output += payload[key];
        output += ' , ';
    }
    return output;
}

function printEmitEvent(eventName, payload){
    let output = 'emit ';
    output += makeEventLog(eventName, payload);
    console.log(output);
}

function printOnEvent(eventName, payload){
    let output = 'receive ';
    output += makeEventLog(eventName, payload);
    console.log(output);
}



main();

function main() {
    applyLocalStorageItems();
    displayGetUserMediaConstraints();
}
// createRoom
function createRoom() {
    createRoomButton.disabled = true;
    awakenButton.disabled = true;
    //callerIdInput.value = uuidv4();
    isCaller = true;
    getLocalStreamCaller();
    emitCreateRoom();
    emitDial();
}

function emitCreateRoom(){
    socket = io(server.value);
    const payload = {
        room: senderValue,
        callerId: senderValue,
    };
    socket.emit(CREATE_ROOM, payload);
    printEmitEvent(CREATE_ROOM, payload);
}

//사실상 서버,웹 클라 둘다 아무것도 하지 않음.
function emitDial(){
    const payload = {
        calleeId: 'any calleeId',
        skipNotification: true,
    }
    socket.emit(DIAL, payload);
    printEmitEvent(DIAL, payload);
}

function emitAwaken() {
    const payload = {
        room: callerIdInput.value,
        callerId: callerIdInput.value,
        calleeId: calleeIdInput.value,
    };
    socket.emit(AWAKEN, payload);
    printEmitEvent(AWAKEN, payload);
}

function emitAccept() {
    const payload = {
    };
    socket.emit(ACCEPT, payload);
    printEmitEvent(ACCEPT, payload);
}

// awaken버튼 눌렀을 때 동작, 제 2, 3자를 위한 버튼
// 웹만의 통신에서는 caller의 id로 room번호가 생기기때문에, caller의 id를 복사한 후 진행
function awakenAndAceept() {
    if (!callerIdInput.value) {
        alert('caller의 ID를 입력해주세요(방번호로서의 역할)');
        return;
    }
    socket = io(server.value);
    isCaller = false;
    createRoomButton.disabled = true;
    awakenButton.disabled = true;
    hangupButton.disabled = false;
    //calleeIdInput.value = uuidv4();

    emitAwaken();
    getLocalStreamCallee();
}

function getLocalStreamCaller() {
    senderValue = callerIdInput.value;
    receiverValue = calleeIdInput.value;

    navigator.mediaDevices.getUserMedia(getUserMediaConstraints())
        .then(gotStream)
        .catch(e => {
            const message = `getUserMedia error: ${e.name}\nPermissionDeniedError may mean invalid constraints.`;
            console.log(message);
            createRoomButton.disabled = false;
        });
}

function getLocalStreamCallee() {
    senderValue = calleeIdInput.value;
    receiverValue = callerIdInput.value;

    navigator.mediaDevices.getUserMedia(getUserMediaConstraints())
        .then(gotStream)
        .then(emitAccept)
        .catch(e => {
            const message = `getUserMedia error: ${e.name}\nPermissionDeniedError may mean invalid constraints.`;
            console.log(message);
            createRoomButton.disabled = false;
        });
}

function gotStream(stream) {
    if(!localStream) {
        localStream = stream;
        localVideo.srcObject = stream;

        localVideo.style.minWidth = `${minWidthInput.value}px`;
        localVideo.style.maxWidth = `${maxWidthInput.value}px`;
        localVideo.style.minHeight = `${minHeightInput.value}px`;
        localVideo.style.maxHeight = `${maxHeightInput.value}px`;
    }
    // createNewPeerConnection();
    addSocketHandler();
}

function handleIceCandidate(e) {
    if (e.candidate) {
        for(let peerConnectionId in peerConnections) {
            const payload = {
                iceCandidate: e.candidate,
                sender: senderValue,
                receiver: peerConnectionId,
            };
            socket.emit(SEND_ICE_CANDIDATE, payload);
            printEmitEvent(SEND_ICE_CANDIDATE, payload);
        }
    }
}

function handleTrackEvent(event) {
    let sessionId = parseSdpId(event.srcElement.remoteDescription.sdp);
    remoteVideos[sessionId].srcObject = event.streams[0];
}

function handleRemoteStreamRemoved(event) {
    console.log('Remote stream removed. Event: ', event);
}

// function handleICEConnectionStateChangeEvent(event) {
//     switch(this.iceConnectionState) {
//         case "closed":
//         case "failed":
//         case "disconnected":
//             hangup(event);
//             break;
//     }
// }

function createNewPeerConnection(participantId){
    const newPeerConnection = new RTCPeerConnection(pcConfig);
    newPeerConnection.onicecandidate = handleIceCandidate;
    newPeerConnection.ontrack = handleTrackEvent;
    newPeerConnection.onnegotiationneeded = (event) => {
        if(!isCaller) {
            newPeerConnection.createOffer().then( offer => {
                if(newPeerConnection.localDescription)
                    return;
                localDescription = offer;
                newPeerConnection.setLocalDescription(offer);
                const payload = {
                    sdp: offer,
                    receiver: participantId,
                    // sender: calleeIdInput.value,
                };
                socket.emit(OFFER, payload);
                printEmitEvent(OFFER, payload);
            }, () => {
                console.log("rejected createOffer()");
            })
        }
    };

    // newPeerConnection.onremovetrack = handleRemoteStreamRemoved;
    // newPeerConnection.oniceconnectionstatechange = (event) => {
    //     switch(newPeerConnection.iceConnectionState) {
    //         case "closed":
    //         case "failed":
    //         case "disconnected":
    //             hangup(event);
    //             break;
    //     }
    // };

    // newPeerConnection.onsignalingstatechange = (event) => {
    //     switch(newPeerConnection.signalingState) {
    //         case "closed":
    //             hangup(event);
    //             break;
    //     }
    // };
    localStream.getTracks().forEach(track => newPeerConnection.addTrack(track, localStream));

    return newPeerConnection;
}

function makeNewVideo(peerConnection, sdp, sender){
    let newRemoteVideo = makeNewVideoTag();
    let newRemoteVideoDiv = makeNewVideoDivTag(newRemoteVideo, sender);
    remoteVideosDiv.append(newRemoteVideoDiv);
    let sessionId = parseSdpId(sdp.sdp);
    remoteVideos[sessionId] = newRemoteVideo;
    peerConnections[sender] = peerConnection;
}

function makeNewVideoTag(){
    let videoTag = document.createElement('video');
    videoTag.setAttribute("playsinline", "");
    videoTag.setAttribute("autoplay", "");
    videoTag.setAttribute("muted", "");
    videoTag.style.cssText = 'margin-top:10px;margin-bottom:0px';
    return videoTag;
}

function makeNewVideoDivTag(newRemoteVideo, sender){
    let videoDivTag = document.createElement('div');

    let videoCaption = document.createElement('h2');
    let senderText = document.createTextNode(sender);
    videoCaption.append(senderText);
    videoCaption.style.cssText = 'margin:0px';

    videoDivTag.append(newRemoteVideo);
    videoDivTag.append(videoCaption);

    let statsDiv = document.createElement('div');
    videoDivTag.append(statsDiv);

    return videoDivTag;
}

function addSocketHandler() {
    socket.on(PARTICIPANTS, (payload) => {
        const {
            participants,
            length,
        } = payload;

        participants.forEach((participant) => {
            if(!peerConnections[participant.userId]){
                peerConnections[participant.userId] = createNewPeerConnection(participant.userId);
            }
        });
        printOnEvent(PARTICIPANTS, payload);
    });

    socket.on(RELAY_OFFER, (payload) => {
        const {
            sdp,
            sender,
        } = payload;
        printOnEvent(RELAY_OFFER, payload);

        const newPc = createNewPeerConnection();
        receiverValue = calleeIdInput.value = sender;

        if(!newPc.remoteDescription) {
            let receivedSdp = new RTCSessionDescription(sdp);
            makeNewVideo(newPc, receivedSdp, sender);
            newPc.setRemoteDescription(receivedSdp);
        }

        newPc.createAnswer().then((answer) => {
            newPc.setLocalDescription(answer);
            const payload = {
                sdp: answer,
                sender: senderValue,
                receiver: sender,
                room: callerIdInput.value,
            };
            socket.emit(ANSWER, payload);
            printEmitEvent(ANSWER, payload);
        })
    });

    socket.on(RELAY_ANSWER, (payload) => {
        const {
            sdp,
            sender,
        } = payload;
        printOnEvent(RELAY_ANSWER, payload);
        const peerConnection = peerConnections[sender];
        if(!peerConnection){
            createNewPeerConnection();
            peerConnection.setLocalDescription(localDescription);
            peerConnections[sender] = peerConnection;
        }

        if(!peerConnection.remoteDescription) {
            let receivedSdp = new RTCSessionDescription(sdp);
            makeNewVideo(peerConnection, receivedSdp, sender);
            peerConnection.setRemoteDescription(receivedSdp);
        }
    });

    socket.on(RELAY_ICE_CANDIDATE, (payload) => {
        const {
            iceCandidate,
            sender,
        } = payload;
        printOnEvent(RELAY_ICE_CANDIDATE);
        let candidate = new RTCIceCandidate(iceCandidate);
        let pc = peerConnections[sender];
        pc.addIceCandidate(candidate).catch((err) => console.log(err));
    });

    socket.on(NOTIFY_END_OF_CALL, (payload) => {
        const {
            sender
        } = payload;
        printOnEvent(NOTIFY_END_OF_CALL);
        delete remoteVideos[sender];
        let peerConnection = peerConnections[sender].close();
        closePeerConnection(peerConnection, sender);
    })
}

function closePeerConnection(peerConnection, peerConnectionId) {
    peerConnection.close();
    Promise.all([
        peerConnection.getStats(null)
            .then(null, err => console.log(err))
    ]).then(() => {
        peerConnection = null;
        delete peerConnections[peerConnectionId];
    });
}

function hangup(event) {

    socket.emit(END_OF_CALL, {});
    printEmitEvent(END_OF_CALL, {});

    for(let sdpId in remoteVideos){
        delete remoteVideos[sdpId];
    }

    for(let peerConnectionId in peerConnections){
        let peerConnection = peerConnections[peerConnectionId];
        closePeerConnection(peerConnection, peerConnectionId);
    }

    localVideo.srcObject = null;
    while(remoteVideosDiv.firstChild){
        remoteVideosDiv.removeChild(remoteVideosDiv.firstChild);
    }

    console.log('Ending call');

    if(localStream!=null){
        localStream.getTracks().forEach(track => {
            track.stop()
        });
        localStream = null;
    }

    hangupButton.disabled = true;
    createRoomButton.disabled = false;
    awakenButton.disabled = false;
}

// input 정보들 읽어서 constraints 만들기
function getUserMediaConstraints() {
    const constraints = {};
    constraints.audio = true;
    constraints.video = {};

    const minWidth = parseInt(minWidthInput.value);
    let maxWidth = parseInt(maxWidthInput.value);
    const minHeight = parseInt(minHeightInput.value);
    let maxHeight = parseInt(maxHeightInput.value);
    const maxFrameRate = parseInt(maxFramerateInput.value);
    let minFrameRate = parseInt(minFramerateInput.value);

    if (minWidthInput.value !== '0') {
        constraints.video.width = {};
        constraints.video.width.min = parseInt(minWidthInput.value);
    }
    if (maxWidthInput.value !== '0') {
        if(maxWidth < minWidth){
            maxWidthInput.value = minWidthInput.value;
            document.getElementById('maxWidth').querySelector('span').textContent = minWidthInput.value;
        }
        constraints.video.width = constraints.video.width || {};
        constraints.video.width.max = parseInt(maxWidthInput.value);
    }
    if (minHeightInput.value !== '0') {
        constraints.video.height = {};
        constraints.video.height.min = parseInt(minHeightInput.value);
    }
    if (maxHeightInput.value !== '0') {
        if(maxHeight < minHeight) {
            maxHeightInput.value = minHeightInput.value;
            document.getElementById('maxHeight').querySelector('span').textContent = minHeightInput.value;
        }
        constraints.video.height = constraints.video.height || {};
        constraints.video.height.max = parseInt(maxHeightInput.value);
    }
    if (minFramerateInput.value !== '0') {
        constraints.video.frameRate = {};
        constraints.video.frameRate.min = parseInt(minFramerateInput.value);
        if(maxFrameRate < minFrameRate) {
            maxFramerateInput.value = minFramerateInput.value;
            document.getElementById('maxFramerate').querySelector('span').textContent = minFramerateInput.value;
        }
    }

    if (maxFramerateInput.value !== '0') {
        constraints.video.frameRate = constraints.video.frameRate || {};
        constraints.video.frameRate.max = parseInt(maxFramerateInput.value);
    }
    return constraints;
}

function displayGetUserMediaConstraints() {
    const constraints = getUserMediaConstraints();
    getUserMediaConstraintsDiv.textContent = JSON.stringify(constraints, null, '    ');
}

function dumpStats(results) {
    let statsString = '';
    results.forEach(res => {
        statsString += '<h3>Report type=';
        statsString += res.type;
        statsString += '</h3>\n';
        statsString += `id ${res.id}<br>`;
        statsString += `time ${res.timestamp}<br>`;
        Object.keys(res).forEach(k => {
            if (k !== 'timestamp' && k !== 'type' && k !== 'id') {
                statsString += `${k}: ${res[k]}<br>`;
            }
        });
    });
    return statsString;
}

function showLocalStats(results) {
    const statsString = dumpStats(results);
    senderStatsDiv.innerHTML = `<h2>Sender stats</h2>${statsString}`;
}

// Utility to show the value of a range in a sibling span element
function displayRangeValue(e) {
    const span = e.target.parentElement.querySelector('span');
    span.textContent = e.target.value;
    displayGetUserMediaConstraints();
    setLocalStorageItem(e);
}

function parseSdpId(sdp) {
    let originStartIndex = sdp.indexOf('o=');
    let originEndIndex = sdp.indexOf('s=');
    return sdp.substring(originStartIndex, originEndIndex);
};
