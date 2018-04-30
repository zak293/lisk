/*
 * Copyright © 2018 Lisk Foundation
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Unless otherwise agreed in a custom licensing agreement with the Lisk Foundation,
 * no part of this software, including this file, may be copied, modified,
 * propagated, or distributed except according to the terms contained in the
 * LICENSE file.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

'use strict';

const crypto = require('crypto');
const scClient = require('socketcluster-client');

const TIMEOUT = 2000;

/**
 * PeerConnectionPool - Helps to manage peer connections efficiently.
 *
 * @class
 * @memberof api.ws.workers
 * @see Parent: {@link api.ws.workers}
 */
function PeerConnectionPool(options) {
	this.system = options.system;
	this.logger = options.logger;
	this.peersNonceMap = {};
}

PeerConnectionPool.prototype.md5 = function(string) {
	var hasher = crypto.createHash('md5');
	hasher.update(string);
	return hasher.digest('hex');
};

PeerConnectionPool.prototype.addPeer = function(peerData) {
	var systemHeaders = this.system.getHeaders();
	var peerNonce = peerData.nonce;

	if (peerNonce === systemHeaders.nonce) {
		this.logger.error('Node tried to connect to itself as a peer');
		return false;
	}

	var peer;
	var existingPeer = this.peersNonceMap[peerNonce];

	if (existingPeer) {
		// If two peers try to connect to each other at the same time,
		// we will select one of the two connections using a consistent rule that
		// both peers can independently agree on.
		// We use this hashing algorithm so that the proportion of inbound vs outbound
		// connections will be approximately even across all peers.
		var nonceHashA = this.md5(peerNonce + systemHeaders.nonce);
		var nonceHashB = this.md5(systemHeaders.nonce + peerNonce);

		if (nonceHashA > nonceHashB) {
			// Destroy the existing peer socket and use the new one instead.
			existingPeer.socket.destroy();
			peer = peerData;
		} else if (nonceHashA < nonceHashB) {
			peer = existingPeer;
		} else {
			// If both md5 hashes are equal then it means that there is an md5 hash
			// collision between our nonce and that of the peer (extremely unlikely).
			// In this case we won't try to connect to the peer (and they won't
			// try to connect to us either).
			this.logger.error(
				`Failed to connect to peer ${peerNonce} due to a nonce hash collision with ours`
			);
			return false;
		}
	} else {
		peer = peerData;
	}

	if (peer.socket) {
		peer.socket.connect();
	} else {
		var connectionOptions = {
			autoConnect: false, // Lazy connection establishment
			autoReconnect: false,
			connectTimeout: TIMEOUT,
			ackTimeout: TIMEOUT,
			pingTimeoutDisabled: true,
			port: peer.wsPort,
			hostname: peer.ip,
			query: systemHeaders,
			multiplex: true,
		};
		peer.socket = scClient.connect(connectionOptions);
		peer.socket.isOutbound = true;
	}

	this.peersNonceMap[peerNonce] = peer;

	return true;
};

PeerConnectionPool.prototype.removePeer = function(peerData) {
	var peerNonce = peerData.nonce;
	var existingPeer = this.peersNonceMap[peerNonce];
	if (!existingPeer) {
		this.logger.error(
			`Failed to remove non-existent peer ${peerNonce} from PeerConnectionPool`
		);
		return false;
	}
	if (existingPeer.socket) {
		existingPeer.socket.destroy();
	}
	delete this.peersNonceMap[peerNonce];
	return true;
};
