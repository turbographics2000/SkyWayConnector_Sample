import { EventEmitter } from './events.js';
import config from './config.js';
import Socket from './socket.js';
import logger from './logger.js';
import util from './util.js';

const PeerEvents = [
    'open',
    'error',
    //'call',
    //'connection',
    'expiresin',
    'candidate',
    'offer',
    'answer',
    'close',
    'leave',
    'disconnected',
];

export class SkyWayConnector extends EventEmitter {
    constructor(id, options) {
        super();

        if (id && id.constructor === Object) {
            options = id;
            id = undefined;
        } else if (id) {
            id = id.toString();
        }

        const defaultOptions = {
            debug: logger.LOG_LEVELS.NONE.value,
            secure: true,
            token: util.randomToken(),
            config: config.defaultConfig,
            turn: true,

            dispatcherSecure: config.DISPATCHER_SECURE,
            dispatcherHost: config.DISPATCHER_HOST,
            dispatcherPort: config.DISPATCHER_PORT,
        };


        this.options = Object.assign({}, defaultOptions, options);

        logger.setLogLevel(this.options.debug);

        if (!util.validateId(id)) {
            this._abort('invalid-id', `ID "${id}" is invalid`);
            return;
        }

        if (!util.validateKey(options.key)) {
            this._abort('invalid-key', `API KEY "${this.options.key}" is invalid`);
            return;
        }

        if (this.options.host === '/') {
            this.options.host = window.location.hostname;
        }
        if (options.secure === undefined && this.options.port !== 443) {
            this.options.secure = undefined;
        }
        this._initializeServerConnection(id);
    }

    /**
     * Creates new Socket and initalize its message handlers.
     * @param {string} id - User's peerId.
     * @private
     */
    _initializeServerConnection(id) {
        this.socket = new Socket(
            this.options.key,
            {
                secure: this.options.secure,
                host: this.options.host,
                port: this.options.port,

                dispatcherSecure: this.options.dispatcherSecure,
                dispatcherHost: this.options.dispatcherHost,
                dispatcherPort: this.options.dispatcherPort,
            }
        );

        this._setupMessageHandlers();

        this.socket.on('error', error => {
            this._abort('socket-error', error);
        });

        this.socket.on('disconnect', () => {
            // If we haven't explicitly disconnected, emit error and disconnect.
            this.disconnect();

            const err = new Error('Lost connection to server.');
            err.type = 'socket-error';
            logger.error(err);
            this.emit(SkyWayConnector.EVENTS.error.key, err);
        });

        this.socket.start(id, this.options.token, this.options.credential);

        window.onbeforeunload = () => {
            this.destroy();
        };
    }


    /**
     * Set up socket's message handlers.
     * @private
     */
    _setupMessageHandlers() {
        this.socket.on(config.MESSAGE_TYPES.SERVER.OPEN.key, openMessage => {
            this.id = openMessage.peerId;
            this._pcConfig = Object.assign({}, this.options.config);

            // make a copy of iceServers as Object.assign still retains the reference
            const iceServers = this._pcConfig.iceServers;
            this._pcConfig.iceServers = iceServers ? iceServers.slice() : [];

            // Set up turn credentials
            const turnCredential = openMessage.turnCredential;
            let turnUserName;
            let turnPassword;
            if (typeof turnCredential === 'object') {
                turnUserName = turnCredential.username;
                turnPassword = turnCredential.credential;
            } else if (typeof turnCredential === 'string') {
                // Handle older server versions that don't send the username
                turnUserName = `${this.options.key}$${this.id}`;
                turnPassword = turnCredential;
            }
            if (this.options.turn === true && turnUserName && turnPassword) {
                // possible turn types are turn-tcp, turns-tcp, turn-udp
                const turnCombinations = [
                    { protocol: 'turn', transport: 'tcp' },
                    { protocol: 'turn', transport: 'udp' },
                ];

                // Edge can not handle turns-tcp
                if (util.detectBrowser() !== 'edge') {
                    turnCombinations.push({ protocol: 'turns', transport: 'tcp' });
                }

                for (let turnType of turnCombinations) {
                    const protocol = turnType.protocol;
                    const transport = turnType.transport;

                    const iceServer = {
                        urls: `${protocol}:${config.TURN_HOST}:${config.TURN_PORT}?transport=${transport}`,
                        url: `${protocol}:${config.TURN_HOST}:${config.TURN_PORT}?transport=${transport}`,

                        username: turnUserName,
                        credential: turnPassword,
                    };

                    this._pcConfig.iceServers.push(iceServer);
                }

                logger.log('SkyWay TURN Server is available');
            } else {
                logger.log('SkyWay TURN Server is unavailable');
            }

            this.emit(SkyWayConnector.EVENTS.open.key, this.id);
        });

        this.socket.on(config.MESSAGE_TYPES.SERVER.error.key, error => {
            const err = new Error(error.message);
            err.type = error.type;
            logger.error(err);
            this.emit(SkyWayConnector.EVENTS.error.key, err);
        });

        this.socket.on(config.MESSAGE_TYPES.SERVER.LEAVE.key, peerId => {
            logger.log(`Received leave message from ${peerId}`);
            //this._cleanupPeer(peerId);
            this.emit(SkyWayConnector.EVENTS.leave.key, peerId);
        });

        this.socket.on(config.MESSAGE_TYPES.SERVER.AUTH_EXPIRES_IN.key, remainingSec => {
            logger.log(`Credential expires in ${remainingSec}`);
            this.emit(SkyWayConnector.EVENTS.expiresin.key, remainingSec);
        });

        this.socket.on(config.MESSAGE_TYPES.SERVER.OFFER.key, offerMessage => {
            //if (offerMessage.dst === this.id)
            this.emit(SkyWayConnector.EVENTS.offer.key, offerMessage);
        });

        this.socket.on(config.MESSAGE_TYPES.SERVER.ANSWER.key, answerMessage => {
            //if (answerMessage.dst === this.id)
            this.emit(SkyWayConnector.EVENTS.answer.key, answerMessage);
        });

        this.socket.on(config.MESSAGE_TYPES.SERVER.CANDIDATE.key, candidateMessage => {
            //if (candidateMessage.dst === this.id)
            this.emit(SkyWayConnector.EVENTS.candidate.key, candidateMessage);
        });
    }

    sendCandidate(dstId, candidate) {
        const msg = this.buildMessage('candidate', candidate, dstId);
        this.socket.send(config.MESSAGE_TYPES.CLIENT.SEND_CANDIDATE.key, msg);
    }

    sendOffer(dstId, offer) {
        const msg = this.buildMessage('offer', offer, dstId);
        this.socket.send(config.MESSAGE_TYPES.CLIENT.SEND_OFFER.key, msg);
    }

    sendAnswer(dstId, answer) {
        const msg = this.buildMessage('answer', answer, dstId);
        this.socket.send(config.MESSAGE_TYPES.CLIENT.SEND_ANSWER.key, msg);
    }

    /**
     * Close socket and clean up some properties, then emit disconnect event.
     */
    disconnect() {
        if (this.open) {
            this.socket.close();
            this.emit(SkyWayConnector.EVENTS.disconnected.key, this.id);
        }
    }

    /**
     * Disconnect the socket and emit error.
     * @param {string} type - The type of error.
     * @param {string} message - Error description.
     * @private
     */
    _abort(type, message) {
        logger.error('Aborting!');
        this.disconnect();

        const err = new Error(message);
        err.type = type;
        logger.error(err);
        this.emit(SkyWayConnector.EVENTS.error.key, err);
    }

    /**
     * Events the Peer class can emit.
     * @type {Enum}
     */
    static get EVENTS() {
        return util.dummyProxy(PeerEvents);
    }

    get PCConfig() {
        return this._pcConfig;
    }

    /*
     * Build Message
     */
    buildMessage(type, body, dstId) {
        const msg = {
            connectionId: '---',
            connectionType: 'media',
            [type]: body,
            dst: dstId
        };
        return msg;
    }
}