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
 * Provides methods to allow this tool to have a linear process
 *
 * @author Ricardo Proença <ricardo@taotesting.com>
 */

const open = require('open');
const inquirer = require('inquirer');
const path = require('path');

const config = require('./config')();
const log = require('./log.js');
const github = require('./github.js');

const gitClientFactory = require('./git.js');
const taoInstanceFactory = require('./taoInstance.js');
const translationsFactory = require('./translations.js');

/**
 * Gets the runner
 *
 * @param {String} wwwUser - name of the www user
 * @param {String} baseBranchName - initial string that help to build a proper branch name for the merging
 * @param {String} mergeBranch - the base branch to merge upon it
 * @returns {Object} resolves with a result object
 */
module.exports = function runner(wwwUser = 'www-data', baseBranchName = 'translations', mergeBranch = 'develop') {
    let data = {};
    let gitClient;
    let githubClient;
    let taoInstance;
    let translationsInstance;
    let branchName;

    return {

        /**
         * Load configuration and check for github token
         */
        async loadConfig() {
            data = Object.assign({}, await config.load());

            // Request github token if necessary
            if (!data.token) {
                setTimeout(() => open('https://github.com/settings/tokens'), 2000);

                const {token} = await inquirer.prompt({
                    type: 'input',
                    name: 'token',
                    message: 'I need a Github token, with "repo" rights (check your browser) : ',
                    filter: tk => tk.trim()
                });

                data.token = token;

                await config.write(data);
            }
        },

        /**
         * Select and initialise tao instance
         */
        async selectTaoInstance() {
            const {taoRoot} = await inquirer.prompt({
                type: 'input',
                name: 'taoRoot',
                message: 'Path to the TAO instance : ',
                default: data.taoRoot || process.cwd()
            });

            taoInstance = taoInstanceFactory(path.resolve(taoRoot), wwwUser);

            const {dir, root} = await taoInstance.isRoot();

            if (!root) {
                log.exit(`${dir} is not a TAO instance`);
            }

            if (!await taoInstance.isInstalled()) {
                log.exit('It looks like the given TAO instance is not installed.');
            }

            data.taoRoot = dir;

            await config.write(data);
        },

        /**
         * Select and initialise the extension to release
         */
        async selectExtension() {
            const availableExtensions = await taoInstance.getExtensions();

            const {extension} = await inquirer.prompt({
                type: 'list',
                name: 'extension',
                message: 'Which extension you want to choose ? ',
                pageSize: 12,
                choices: availableExtensions,
                default: data.extension && data.extension.name,
            });

            data.extension = {
                name: extension,
                path: path.normalize(`${data.taoRoot}/${extension}`),
            };

            await config.write(data);
        },

        /**
         * Select language from an extension
         */
        async selectLanguage() {
            const languagesData = await taoInstance.getLanguages(data.extension.path);
            const availableLanguages =
                languagesData
                    .filter(entry => entry.language)
                    .map(entry => path.basename(entry.dir));

            const {language} = await inquirer.prompt({
                type: 'list',
                name: 'language',
                message: 'Which language you want to choose ? ',
                pageSize: 12,
                choices: availableLanguages,
                default: data.language && data.language.name,
            });

            const lang = languagesData.filter((entry) => {
                return entry.name === language;
            });

            data.language = {
                name: language,
                path: path.normalize(`${data.extension.path}/locales/${language}`),
                files: lang[0].files
            };

            await config.write(data);
        },

        /**
         * Select the folder where are the new translations
         */
        async selectTranslationsFolder() {
            const {translation} = await inquirer.prompt({
                type: 'input',
                name: 'translation',
                message: `Path to the *.PO files for the "${data.language.name}" language : `,
                default: data.translation && data.translation.path || process.cwd(),
            });

            const isLanguage = await taoInstance.isLanguage(translation);

            if (!isLanguage.language) {
                log.error(`${translation} must be a valid language directory`);
                process.exit();
            }

            data.translation = {
                path: path.normalize(translation),
                files: isLanguage.files
            };

            await config.write(data);
        },

        /**
         * Set the search mode for searching changeable translations
         */
        async selectSearchModeEndsWith() {
            const {endsWith} = await inquirer.prompt({
                type: 'input',
                name: 'endsWith',
                message: 'Search files for messages that ends with :'
            });

            data.searchMode = {};

            if (endsWith) {
                data.searchMode.endsWith = `${endsWith}`;
            }

            await config.write(data);
        },

        /**
         * Verify if local branch has no uncommitted changes
         */
        async verifyLocalChanges() {
            gitClient = gitClientFactory(path.join(data.taoRoot, data.extension.name));

            if (await gitClient.hasLocalChanges()) {
                log.warn(`The extension ${data.extension.name} has local changes. Make sure you can continue with this process.`);
            }
        },

        /**
         * Recap of the user choices
         */
        async proceed() {
            const {proceed} = await inquirer.prompt({
                type: 'confirm',
                name: 'proceed',
                message: `Extension: ${data.extension.name}\n  Language: ${data.language.name}\n  *.PO files: ${data.translation.path}\n  Find empty messages and messages ending with ${data.searchMode.endsWith}\n  Proceed?`,
                default: data.translation.path,
            });

            if (!proceed) {
                process.exit();
            }
        },

        /**
         * Merge empty translations
         */
        async prepareMerge() {
            translationsInstance = translationsFactory(data.language, data.translation);

            await translationsInstance.setupTranslationsContent(data.searchMode);

            log.info('Building diff');
            await translationsInstance.buildDiff();

            const {proceed} = await inquirer.prompt({
                type: 'confirm',
                name: 'proceed',
                message: 'Are you sure you want to merge the translations ?',
                default: true
            });

            if (!proceed) {
                process.exit();
            }
        },


        /**
         * Create releasing branch
         */
        async createBranch() {
            const now = new Date();
            const nowStr = `${now.getFullYear()}${now.getMonth()}${now.getDate()}.${now.getHours()}${now.getMinutes()}${now.getSeconds()}`;
            branchName = `${baseBranchName}/${data.extension.name}/${data.language.name}/${nowStr}`;

            await gitClient.localBranch(branchName);

            log.done(`${branchName} created`);
        },

        /**
         * Merge translations
         */
        async mergeTranslations() {
            await translationsInstance.merge();
        },

        /**
         * Commit and push changes to the branch
         */
        async commitAndPush() {
            const changes = await gitClient.commitAndPush(branchName, 'add new translations');

            if (changes && changes.length) {
                log.info(`Commit : [added translations for - ${changes.length} files]`);
                changes.forEach(file => log.info(`  - ${file}`));
            }
        },

        /**
         * Asks user to bump version
         */
        async bumpVersion() {
            const {bumpVersion} = await inquirer.prompt({
                type: 'confirm',
                name: 'proceed',
                message: 'Please bump version (manifest + update script) to be able to commit and push. Proceed ?'
            });

            if (!bumpVersion) {
                process.exit();
            }
        },

        /**
         * Initialise github client for the extension to release repository
         */
        async initialiseGithubClient() {
            const repoName = await taoInstance.getRepoName(data.extension.name);

            if (repoName) {
                githubClient = github(data.token, repoName);
            } else {
                log.exit('Unable to find the github repository name');
            }
        },

        /**
         * Create pull request from branch
         */
        async createPullRequest() {
            log.doing('Create the pull request');

            const pullRequest = await githubClient.createReleasePR(
                branchName,
                mergeBranch,
                `Merge translations - ${data.extension.name} - ${data.language.name}`,
                `Merging translations in ${data.extension.name} extension for the ${data.language.name} language.`
            );

            if (pullRequest && pullRequest.state === 'open') {
                data.pr = {
                    url: pullRequest.html_url,
                    apiUrl: pullRequest.url,
                    number: pullRequest.number,
                    id: pullRequest.id
                };

                log.info(`${data.pr.url} created`);
                log.done();
            } else {
                log.exit('Unable to create the pull request');
            }
        }
    };
};
