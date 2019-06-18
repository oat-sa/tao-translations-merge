/**
 * This program is free software; you can redistribute it and/or
 * modify it under the terms of the GNU General Public License
 * as published by the Free Software Foundation; under version 2
 * of the License (non-upgradable).
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program; if not, write to the Free Software
 * Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.
 *
 * Copyright (c) 2019 Open Assessment Technologies SA;
 */

/**
 * Provides some local git repository actions
 *
 * @author Ricardo Proença <ricardo@taotesting.com>
 */

const git = require('simple-git/promise');

/**
 * Creates a git client
 *
 * @param {String} repository - the git repository path
 * @param {String} origin - remote name
 * @returns {githubClient} the client
 */
module.exports = function gitFactory(repository = '', origin = 'origin') {

    /**
     * @typedef gitClient
     * @type {Object}
     */
    return {

        /**
         * Create and checkout a local branch
         * @param {String} branchName - the branch name
         * @returns {Promise}
         */
        localBranch(branchName) {
            return git(repository)
                .checkoutLocalBranch(branchName);
        },

        /**
         * Does the repository has changes ?
         * @returns {Promise<Boolean>}
         */
        hasLocalChanges() {
            const empty = ['modified', 'renamed', 'conflicted', 'created', 'deleted'];
            return git(repository)
                .status()
                .then(status =>
                    empty.some(value => status[value].length > 0)
                );
        },

        /**
         * Commit and push every changes on the current branch
         * @param {String} branchName - name of the branch to push to
         * @param {String} comment - commit comment
         * @returns {Promise}
         */
        commitAndPush(branchName, comment = '') {
            let changes = [];
            return git(repository).diffSummary()
                .then(results => {
                    if (results && results.files) {
                        changes = results.files.map(file => file.file);
                        return git(repository)
                            .commit(comment, changes)
                            .then(() => git(repository).push(origin, branchName));
                    }
                })
                .then(() => changes);
        },
    };
};
