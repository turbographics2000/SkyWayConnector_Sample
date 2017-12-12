import { SkyWayConnector } from './SkyWayConnector.js';

let pcs = {};
let myId = null;

const con = new SkyWayConnector({
    key: 'cc1edbd6-1f11-48ab-9680-f2a5f74633b4'
});

con.on('open', conId => {
    dispMyId.textContent = myId = conId;
    btnConnect.disabled = false;
    console.log(`SkyWayConnector open. id='${myId}'`);
});

con.on('offer', msg => {
    console.log('offer msg', msg);
    const remoteId = msg.src;
    let pc = pcs[remoteId];
    if (!pc) {
        pc = setupPC(remoteId, true);
    }
    pc.setRemoteDescription(msg.offer).then(_ => {
        return pc.createAnswer();
    }).then(answer => {
        return pc.setLocalDescription(answer);
    }).then(_ => {
        con.sendAnswer(remoteId, pc.localDescription);
    });
});

con.on('answer', msg => {
    console.log('answer msg', msg);
    const remoteId = msg.src;
    let pc = pcs[remoteId];
    pc.setRemoteDescription(msg.answer);    
});

con.on('candidate', msg => {
    console.log('candidate msg', msg);
    const remoteId = msg.src;
    let pc = pcs[remoteId];
    pc.addIceCandidate(msg.candidate);
});

con.on('leave', msg => {
    console.log('leave msg', msg);
});

con.on('expiresin', msg => {
    console.log('expiresin msg', msg);
});

btnConnect.onclick = function (evt) {
    if (!txtRemoteId.value.trim()) return;
    const remoteId = txtRemoteId.value;
    setupPC(txtRemoteId.value);
};

function setupPC(remoteId, callee) {
    const pc = pcs[remoteId] = new RTCPeerConnection(con.PCConfig);
    pcs[remoteId].remoteId = remoteId;

    pc.onicecandidate = function (evt) {
        if (evt.candidate)
            con.sendCandidate(this.remoteId, evt.candidate);
    };

    pc.onnegotiationneeded = function () {
        pc.createOffer().then(offer => {
            return this.setLocalDescription(offer);
        }).then(_ => {
            con.sendOffer(this.remoteId, this.localDescription);
        }).catch(err => {
            logError(err);
        });
    };

    pc.ontrack = function (evt) {
        if (!remoteView.srcObject)
            remoteView.srcObject = evt.streams[0];
    };

    selfView.onloadedmetadata = function(evt) {
        const stream = selfView.captureStream();
        stream.getVideoTracks().forEach(track => {
            pc.addTrack(track);
        });
    };
    selfView.src = callee ? 'sintel.mp4' : 'bipbop.mp4';
    
    return pc;
}

function logError(error) {
   console.error(error);
}