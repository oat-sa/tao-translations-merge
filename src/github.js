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
 * Provides some git repository actions
 *
 * @author Ricardo Proença <ricardo@taotesting.com>
 */

const validate = require('./validate.js');

/**
 * Creates a github client helper
 * @param {String} token - the github token, with permissions to manage the repo
 * @param {String} repository - the github repository name
 * @returns {githubClient} the client
 */
module.exports = function githubFactory(token, repository) {

    //check parameters
    validate
        .githubToken(token)
        .githubRepository(repository);

    /* TODO: Since github v4 api does not support all required functionality at the moment of integration,
       currently mixed approach is used:
            - Github v4 api is used to fetch data.
            - octonode package is used for creating pull request and release.
       Once github v4 api add support for missing functionality, the application should be fully migrated to the v4 api
    */
    const client = require('octonode').client(token);
    const ghrepo = client.repo(repository);

    /**
     * @typedef {Object} githubClient
     */
    return {

        /**
         * Create the release pull request
         * @param {String} releasingBranch - the temp branch that contains the commits to release
         * @param {String} releaseBranch - the base branch
         * @param {String} title - PR title
         * @param {String} body - body of PR
         * @returns {Promise<Object>} resolves with the pull request data
         */
        createReleasePR(releasingBranch, releaseBranch, title, body) {
            if (!releasingBranch || !releaseBranch) {
                return Promise.reject(new TypeError('Unable to create a release pull request when the branches are not defined'));
            }
            return new Promise((resolve, reject) => {
                ghrepo.pr({
                    title: title,
                    body: body,
                    head: releasingBranch,
                    base: releaseBranch
                }, (err, data) => {
                    if (err) {
                        return reject(err);
                    }
                    return resolve(data);
                });
            });
        }
    };
};
