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
let remoteVideo;
const remoteVideosDiv = document.querySelector('div#remoteVideos');
// const remoteVideo = document.querySelector('div#remoteVideo video');
const localVideoStatsDiv = document.querySelector('div#localVideo div');
const remoteVideoStatsDiv = document.querySelector('div#remoteVideo div');

const pcConfig = {
    'iceServers': [{
        urls: 'stun:stun.l.google.com:19302'
    },
    {
        urls: 'turn:numb.viagenie.ca',
        credential: 'muazkh',
        username: 'webrtc@live.com',
    }]
};

let isCaller = false;

let peerConnections = {};
let receiverValue;
let senderValue;
let localStream;
let localDescription;
let bytesPrev;
let timestampPrev;
let socket = io(server.value);

// 참고 : https://stackoverflow.com/questions/105034/create-guid-uuid-in-javascript
function uuidv4() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

main();

function main() {
    displayGetUserMediaConstraints();
}
// createRoom
function createRoom() {
    createRoomButton.disabled = true;
    awakenButton.disabled = true;
    callerIdInput.value = uuidv4();
    isCaller = true;
    getLocalStreamCaller();
    emitCreateRoom();
    emitDial();
}

function emitCreateRoom(){
    socket.emit('createRoom', {
        room: senderValue,
        callerId: senderValue,
    })
}

//사실상 서버,웹 클라 둘다 아무것도 하지 않음.
function emitDial(){
    socket.emit('dialToCallee', {
        calleeId: 'calleeId',
        skipNotification: true,
    })
}

function emitAwaken() {
    socket.emit('awaken', {
        room: callerIdInput.value,
        callerId: callerIdInput.value,
        calleeId: calleeIdInput.value,
    });
}

function emitAccept() {
    socket.emit('accept', {
        room: callerIdInput.value,
        calleeId: calleeIdInput.value,
    })
}

// awaken버튼 눌렀을 때 동작, 제 2, 3자를 위한 버튼
// 웹만의 통신에서는 caller의 id로 room번호가 생기기때문에, caller의 id를 복사한 후 진행
function awakenAndAceept() {
    if (!callerIdInput.value) {
        alert('caller의 ID를 입력해주세요(방번호로서의 역할)');
        return;
    }

    isCaller = false;
    createRoomButton.disabled = true;
    awakenButton.disabled = true;
    hangupButton.disabled = false;
    calleeIdInput.value = uuidv4();

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
    }
    // createNewPeerConnection();
    addSocketHandler();
}

function handleIceCandidate(e) {
    console.log("sendIceCandidate: ", receiverValue);
    if (e.candidate) {
        socket.emit('sendIceCandidate', {
            iceCandidate: e.candidate,
            sender: senderValue,
            room: callerIdInput.value,
        })
    }
}

function handleTrackEvent(event) {
    let sessionId = parseSdpId(event.srcElement.remoteDescription.sdp);
    remoteVideos[sessionId].srcObject = event.streams[0];
}

function handleRemoteStreamRemoved(event) {
    console.log('Remote stream removed. Event: ', event);
}

function handleICEConnectionStateChangeEvent(event) {
    switch(this.iceConnectionState) {
        case "closed":
        case "failed":
        case "disconnected":
            hangup(event);
            break;
    }
}

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
                socket.emit('offer', {
                    sdp: offer,
                    sender: calleeIdInput.value,
                    receiver: participantId,
                });
            }, () => {
                console.log("rejected createOffer()");
            })
        }
    };

    newPeerConnection.onremovetrack = handleRemoteStreamRemoved;
    newPeerConnection.oniceconnectionstatechange = (event) => {
        switch(newPeerConnection.iceConnectionState) {
            case "closed":
            case "failed":
            case "disconnected":
                hangup(event);
                break;
        }
    };

    newPeerConnection.onsignalingstatechange = (event) => {
        switch(newPeerConnection.signalingState) {
            case "closed":
                hangup(event);
                break;
        }
    };
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

    return videoDivTag;
}

function addSocketHandler() {
    socket.on('participants', (payload) => {
        const {
            participants,
            length,
        } = payload;

        participants.forEach((participant) => {
            if(!peerConnections[participant.userId]){
                peerConnections[participant.userId] = createNewPeerConnection(participant.userId);
            }
        });
    });

    socket.on('relayOffer', (payload) => {
        const {
            sdp,
            sender,
        } = payload;

        const newPc = createNewPeerConnection();


        console.log(`relayOffer/ sdp : ${sdp}`);
        receiverValue = calleeIdInput.value = sender;

        if(!newPc.remoteDescription) {
            let receivedSdp = new RTCSessionDescription(sdp);
            makeNewVideo(newPc, receivedSdp, sender);
            newPc.setRemoteDescription(receivedSdp);
        }

        newPc.createAnswer().then((answer) => {
            newPc.setLocalDescription(answer);
            socket.emit('sendAnswer', {
                sdp: answer,
                sender: senderValue,
                receiver: sender,
                room: callerIdInput.value,
            })
        })
    });

    socket.on('relayAnswer', (payload) => {
        const {
            sdp,
            sender,
            receiver,
        } = payload;
        console.log(`relayAnswer/ sdp : ${sdp}, sender : ${sender}, receiver : ${receiver}`);
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

    socket.on('relayIceCandidate', (payload) => {
        const {
            iceCandidate,
            sender,
        } = payload;
        console.log(`relayIceCandidate/ sender : ${sender}`);
        let candidate = new RTCIceCandidate(iceCandidate);
        let pc = peerConnections[sender];
        pc.addIceCandidate(candidate).catch((err) => console.log(err));
    });
}

function hangup(event) {
    let sessionId = parseSdpId(event.srcElement.remoteDescription.sdp);
    console.log(`sessionId : ${sessionId}`);
    remoteVideos[sessionId].srcObject = event.streams[0];

    if(localPeerConnection.connectionState !== 'connected')
        return;
    console.log('Ending call');
    localPeerConnection.close();

    // query stats one last time.
    Promise
        .all([
            localPeerConnection
                .getStats(null)
                .then(showLocalStats, err => console.log(err))
        ])
        .then(() => {
            localPeerConnection = null;
        });

    localStream.getTracks().forEach(track => {
        console.log(track);
        track.stop()
    });
    localStream = null;

    hangupButton.disabled = true;
    createRoomButton.disabled = false;
    awakenButton.disabled = false;
}

// input 정보들 읽어서 constraints 만들기
function getUserMediaConstraints() {
    const constraints = {};
    constraints.audio = true;
    constraints.video = {};
    if (minWidthInput.value !== '0') {
        constraints.video.width = {};
        constraints.video.width.min = minWidthInput.value;
    }
    if (maxWidthInput.value !== '0') {
        constraints.video.width = constraints.video.width || {};
        constraints.video.width.max = maxWidthInput.value;
    }
    if (minHeightInput.value !== '0') {
        constraints.video.height = {};
        constraints.video.height.min = minHeightInput.value;
    }
    if (maxHeightInput.value !== '0') {
        constraints.video.height = constraints.video.height || {};
        constraints.video.height.max = maxHeightInput.value;
    }
    if (minFramerateInput.value !== '0') {
        constraints.video.frameRate = {};
        constraints.video.frameRate.min = minFramerateInput.value;
    }
    if (maxFramerateInput.value !== '0') {
        constraints.video.frameRate = constraints.video.frameRate || {};
        constraints.video.frameRate.max = maxFramerateInput.value;
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
}

function parseSdpId(sdp) {
    let originStartIndex = sdp.indexOf('o=');
    let originEndIndex = sdp.indexOf('s=');
    return sdp.substring(originStartIndex, originEndIndex);
};