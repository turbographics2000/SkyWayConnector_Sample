
export class EventEmitter {
    constructor() {
        this.eventListeners = {};
    }

    on(eventName, callback) {
        if (typeof callback !== 'function') {
            throw new Error('callback is not a function.');
        }
        this.eventListeners[eventName] = this.eventListeners[eventName] || [];
        this.eventListeners[eventName].push(callback);
    }

    off(eventName, callback) {
        if (typeof callback !== 'function') {
            throw new Error('callback is not a function.');
        }
        let listeners = this.eventListeners[eventName];
        if (!listeners) return;
        if (callback) {
            listeners.splice(listeners.indexOf(callback), 1);
        }
    }

    emit(eventName, ...args) {
        if (!this.eventListeners[eventName]) return;
        this.eventListeners[eventName].forEach(callback => {
            callback(...args);
        })
    }
}
