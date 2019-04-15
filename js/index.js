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
const remoteVideo = document.querySelector('div#remoteVideo video');
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

let localPeerConnection;
let localStream;
let remoteStream;
let bytesPrev;
let timestampPrev;
let socket = io(server.value);

// TODO : send, relay icecandidate

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


function hangup() {
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

    localStream.getTracks().forEach(track => track.stop());
    localStream = null;

    hangupButton.disabled = true;
    createRoomButton.disabled = false;
}

// createRoom
function createRoom() {
    createRoomButton.disabled = true;
    awakenButton.disabled = true;
    callerIdInput.value = uuidv4();
    getLocalStream(true);
    emitCreateRoom();
    emitDial();
}

let candidateReceiver;
function getLocalStream(caller) {

    navigator.mediaDevices.getUserMedia(getUserMediaConstraints())
        .then(gotStream)
        .catch(e => {
            const message = `getUserMedia error: ${e.name}\nPermissionDeniedError may mean invalid constraints.`;
            console.log(message);
            createRoomButton.disabled = false;
        });

    localPeerConnection = new RTCPeerConnection(null);
    if(caller){
        candidateReceiver = calleeIdInput.value;
    }else{
        candidateReceiver = callerIdInput.value;
    }
    localPeerConnection.onicecandidate = handleIceCandidate;
    localPeerConnection.ontrack = e => {
        remoteVideo.srcObject = e.streams[0];
    };

    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        const videoTracks = localStream.getVideoTracks();
        for (let i = 0; i !== videoTracks.length; ++i) {
            videoTracks[i].stop();
        }
    }
}

function gotStream(stream) {
    localStream = stream;
    localVideo.srcObject = stream;

    localPeerConnection = new RTCPeerConnection(null);
    localPeerConnection.onicecandidate = handleIceCandidate;
    localPeerConnection.onaddstream = handleRemoteStreamAdded;
    localPeerConnection.onremovestream = handleRemoteStreamRemoved;

    localPeerConnection.addStream(localStream);
}

function handleIceCandidate(e) {
    console.log("sendIceCandidate: ", e);
    if (e.candidate) {
        socket.emit('sendIceCandidate', {
            iceCandidate: e.candidate,
            receiver: candidateReceiver,
            room: callerIdInput.value,
        })
    }
}

function handleRemoteStreamAdded(event) {
    console.log('Remote stream added.');
    remoteStream = event.stream;
    remoteVideo.srcObject = remoteStream;
}

function handleRemoteStreamRemoved(event) {
    console.log('Remote stream removed. Event: ', event);
}

function emitCreateRoom(){
    socket.emit('createRoom', {
        room: callerIdInput.value,
        callerId: callerIdInput.value,
    })
}

//사실상 서버,웹 클라 둘다 아무것도 하지 않음.
function emitDial(){
    socket.emit('dialToCallee', {
        calleeId: 'calleeId',
        skipNotification: true,
    })
}

// awaken버튼 눌렀을 때 동작, 제 2, 3자를 위한 버튼
// 웹만의 통신에서는 caller의 id로 room번호가 생기기때문에, caller의 id를 복사한 후 진행
function awakenAndAceept() {
    if (!callerIdInput.value) {
        alert('caller의 ID를 입력해주세요(방번호로서의 역할)');
        return;
    }
    function awaken() {
        createRoomButton.disabled = true;
        awakenButton.disabled = true;
        calleeIdInput.value = uuidv4();

        socket.emit('awaken', {
            room: callerIdInput.value,
            calleeId: calleeIdInput.value,
        });
        socket.emit('created', {
            calleeId: calleeIdInput.value,
        })
    }

    function accept(){

        let sdp;

        //create offer, send accept with sdp
        localPeerConnection.createOffer().then( offer => {
            sdp = offer;
            localPeerConnection.setLocalDescription(offer);
            socket.emit('accept', {
                sdp: sdp,
                room: callerIdInput.value,
                receiver: calleeIdInput.value,
            });
        })
    }
    getLocalStream(false);
    awaken();
    accept();
}

socket.on('relayOffer', (payload) => {
    const {
        sdp,
        receiver,
    } = payload;

    console.log(`relayOffer/ sdp : ${sdp}, receiver : ${receiver}`);
    calleeIdInput.value = receiver;
    localPeerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
    localPeerConnection.createAnswer().then((answer) => {
        localPeerConnection.setLocalDescription(answer);
        socket.emit('sendAnswer', {
            sdp: answer,
            receiver,
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
    // TODO : Failed to set remote answer sdp: Called in wrong state: kStable
    localPeerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
});

socket.on('relayIceCandidate', (payload) => {
    console.log('relayIceCandidate');
    const {
        iceCandidate,
        sender,
        receiver,
    } = payload;
    let candidate = new RTCIceCandidate({
        sdpMLineIndex: iceCandidate.sdpMLineIndex,
        candidate: iceCandidate.candidate
    });
    localPeerConnection.addIceCandidate(candidate);
});

let turnReady;
if (location.hostname !== 'localhost') {
    requestTurn(
        'https://computeengineondemand.appspot.com/turn?username=41784574&key=4080218913'
    );
}

function requestTurn(turnURL) {
    let turnExists = false;
    for (let i in pcConfig.iceServers) {
        if (pcConfig.iceServers[i].urls.substr(0, 5) === 'turn:') {
            turnExists = true;
            turnReady = true;
            break;
        }
    }
    if (!turnExists) {
        console.log('Getting TURN server from ', turnURL);
        // No TURN server. Get one from computeengineondemand.appspot.com:
        let xhr = new XMLHttpRequest();
        xhr.onreadystatechange = function() {
            if (xhr.readyState === 4 && xhr.status === 200) {
                let turnServer = JSON.parse(xhr.responseText);
                console.log('Got TURN server: ', turnServer);
                pcConfig.iceServers.push({
                    'urls': 'turn:' + turnServer.username + '@' + turnServer.turn,
                    'credential': turnServer.password
                });
                turnReady = true;
            }
        };
        xhr.open('GET', turnURL, true);
        xhr.send();
    }
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

// Utility to show the value of a range in a sibling span element
function displayRangeValue(e) {
    const span = e.target.parentElement.querySelector('span');
    span.textContent = e.target.value;
    displayGetUserMediaConstraints();
}
