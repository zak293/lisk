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

var Promise = require('bluebird');
var lisk = require('lisk-js');
var accountFixtures = require('../../../fixtures/accounts');
var constants = require('../../../../helpers/constants');
var randomUtil = require('../../../common/utils/random');
var waitFor = require('../../../common/utils/wait_for');
var sendTransactionsPromise = require('../../../common/helpers/api')
	.sendTransactionsPromise;
var getTransaction = require('../../utils/http').getTransaction;

module.exports = function(params) {
	describe('postTransactions - type 2 @slow', () => {
		const maximum = 25;
		const transferAmount = 5000000000;
		let transferTransactions;
		let accounts;
		let bundleSize;

		function confirmTransactionsOnAllNodes(transactions) {
			return Promise.all(
				_.flatMap(params.configurations, configuration => {
					return transactions.map(transaction => {
						return getTransaction(transaction.id, configuration.httpPort);
					});
				})
			).then(results => {
				results.forEach(transaction => {
					expect(transaction)
						.to.have.property('id')
						.that.is.an('string');
				});
			});
		}

		before(done => {
			bundleSize = params.configurations[0].broadcasts.releaseLimit;
			done();
		});

		beforeEach('send 50 LSK to 1000 accounts', done => {
			transferTransactions = [];
			accounts = [];
			Promise.mapSeries(_.range(Math.ceil(maximum / bundleSize)), () => {
				const bundled = [];
				_.range(bundleSize).forEach(() => {
					const account = randomUtil.account();
					const transaction = lisk.transaction.createTransaction(
						account.address,
						transferAmount,
						accountFixtures.genesis.password
					);
					transferTransactions.push(transaction);
					accounts.push(account);
					bundled.push(transaction);
				});

				return sendTransactionsPromise(bundled);
			}).then(() => {
				const blocksToWait = Math.ceil(maximum / constants.maxTxsPerBlock) + 1;
				waitFor.blocks(blocksToWait, () => {
					confirmTransactionsOnAllNodes(transferTransactions).then(done);
				});
			});
		});

		describe('sending 1000 bundled delegate transactions from accounts with funds', () => {
			const delegateTransactions = [];

			beforeEach('create and post 1000 delegate transactions in bundle', () => {
				return Promise.mapSeries(
					_.range(Math.ceil(maximum / bundleSize)),
					bundledRequestNum => {
						const bundled = [];
						_.range(bundleSize).forEach(transactionIndexWithinBundle => {
							const account =
								accounts[
									bundledRequestNum * bundleSize + transactionIndexWithinBundle
								];
							const transaction = lisk.delegate.createDelegate(
								account.password,
								account.username
							);
							delegateTransactions.push(transaction);
							bundled.push(transaction);
						});

						return sendTransactionsPromise(bundled);
					}
				);
			});

			it('should confirm all type 2 bundled transactions on all nodes', done => {
				var blocksToWait = Math.ceil(maximum / constants.maxTxsPerBlock) + 1;
				waitFor.blocks(blocksToWait, () => {
					confirmTransactionsOnAllNodes(delegateTransactions).then(done);
				});
			});
		});

		describe('sending 1000 single delgate transactions from accounts with funds', () => {
			const delegateTransactions = [];

			beforeEach('create and post 1000 delegate transactions separtely', () => {
				return Promise.all(
					_.range(maximum).map(index => {
						const account = accounts[index];
						const transaction = lisk.delegate.createDelegate(
							account.password,
							account.username
						);
						delegateTransactions.push(transaction);
						return sendTransactionsPromise([transaction]);
					})
				);
			});

			it('should confirm all type 2 transactions on all nodes', done => {
				var blocksToWait = Math.ceil(maximum / constants.maxTxsPerBlock) + 1;
				waitFor.blocks(blocksToWait, () => {
					confirmTransactionsOnAllNodes(delegateTransactions).then(done);
				});
			});
		});
	});
};
