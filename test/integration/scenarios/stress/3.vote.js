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

const Promise = require('bluebird');
const lisk = require('lisk-js');
const genesisDelegates = require('../../../data/genesis_delegates.json')
	.genesisDelegates;
const accountFixtures = require('../../../fixtures/accounts');
const constants = require('../../../../helpers/constants');
const randomUtil = require('../../../common/utils/random');
const waitFor = require('../../../common/utils/wait_for');
const sendTransactionsPromise = require('../../../common/helpers/api')
	.sendTransactionsPromise;
const getTransaction = require('../../utils/http').getTransaction;

module.exports = function(params) {
	describe('postTransactions - type 3 @slow', () => {
		const bundleSize = params.configurations[0].broadcasts.releaseLimit;
		const transferTransactions = [];
		const accounts = [];
		const maximum = 1000;
		const transferAmount = 5000000000;

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

		beforeEach('send 50 LSK to 1000 accounts', done => {
			Promise.mapSeries(_.range(Math.ceil(maximum / bundleSize)), () => {
				const bundled = [];
				_.range(bundleSize).each(() => {
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
				const blocksToWait = Math.ceil(maximum / constants.maxTxsPerBlock);
				waitFor.blocks(blocksToWait, () => {
					confirmTransactionsOnAllNodes(transferTransactions).then(done);
				});
			});
		});

		describe('sending 1000 bundled vote transactions with 33 votes from accounts with funds', () => {
			const voteTransactions = [];

			beforeEach('create and post 1000 vote transactions', () => {
				return Promise.mapSeries(
					_.range(Math.ceil(maximum / bundleSize)),
					bundledRequestNum => {
						const bundled = [];
						_.range(bundleSize).each(transactionIndexWithinBundle => {
							const account =
								bundledRequestNum * bundleSize + transactionIndexWithinBundle;
							const transaction = lisk.vote.createVote(
								account.password,
								_(33)
									.range()
									.map(() => `+${genesisDelegates[_.random(0, 100)].publicKey}`)
									.uniq()
									.value()
							);
							voteTransactions.push(transaction);
							bundled.push(transaction);
						});

						return sendTransactionsPromise(bundled);
					}
				);
			});

			it('should confirm all type 3 bundled transactions on all nodes', done => {
				var blocksToWait = Math.ceil(maximum / constants.maxTxsPerBlock);
				waitFor.blocks(blocksToWait, () => {
					confirmTransactionsOnAllNodes(voteTransactions).then(done);
				});
			});
		});

		describe('sending 1000 single vote transactions with 33 votes from accounts with funds', () => {
			const voteTransactions = [];

			before(() => {
				return Promise.all(
					_.range(maximum).map(index => {
						const account = accounts[index];
						const transaction = lisk.vote.createVote(
							account.password,
							_(33)
								.range()
								.map(() => `+${genesisDelegates[_.random(0, 100)].publicKey}`)
								.uniq()
								.value()
						);
						voteTransactions.push(transaction);
						return sendTransactionsPromise([transaction]);
					})
				);
			});

			it('should confirm all type 3 transactions on all nodes', done => {
				var blocksToWait = Math.ceil(maximum / constants.maxTxsPerBlock);
				waitFor.blocks(blocksToWait, () => {
					confirmTransactionsOnAllNodes(voteTransactions).then(done);
				});
			});
		});
	});
};
