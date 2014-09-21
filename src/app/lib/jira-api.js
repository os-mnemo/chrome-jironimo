/**
 * chrome-jironimo
 *
 * @author Kanstantsin Kamkou <2ka.by>
 * @{@link http://github.com/kkamkou/chrome-jironimo}
 * @license http://opensource.org/licenses/BSL-1.0 Boost Software License 1.0 (BSL-1.0)
 */
angular
  .module('jironimo.jira', ['jironimo.settings'])
  .service('cjJira', function ($rootScope, cjSettings) {
    /** @type {Object} */
    var cache = {};

    /**
     * Information about myself
     *
     * @public
     * @return {Object}
     */
    this.me = function () {
      if (!cache.authSession) {
        throw new Error('The cache does not have such an entry');
      }
      return cache.authSession;
    };

    /**
     * Check if use is authenticated or not
     *
     * @public
     * @param {Function} callback
     */
    this.authSession = function (callback) {
      if (cache.authSession) {
        return callback(null, cache.authSession);
      }

      this._makeRequest('/auth/latest/session', {}, function (err, data) {
        if (!err) {
          cache.authSession = data;
        }
        callback(err, data);
      });
    };

    /**
     * Executes query
     *
     * @public
     * @param {String} query
     * @param {Function} callback
     */
    this.search = function (query, callback) {
      this._makeRequest('/api/latest/search', {jql: query}, callback);
    };

    /**
     * Returns the favourite filters of the logged-in user
     *
     * @public
     * @param {Function} callback
     */
    this.filterFavourite = function (callback) {
      this._makeRequest('/api/latest/filter/favourite', {}, callback);
    };

    /**
     * Assigns an issue to a user
     *
     * @param {Number} issueId
     * @param {String} userName
     * @param {Function} callback
     */
    this.issueAssignee = function (issueId, data, callback) {
      this._makeRequest(
        '/api/latest/issue/' + issueId + '/assignee', data, callback
      );
    };

    /**
     * Adds a new worklog entry to an issue
     *
     * @param {Number} issueId
     * @param {Object} data
     * @param {Function} callback
     */
    this.issueWorklog = function (issueId, data, callback) {
      this._makeRequest(
        '/api/latest/issue/' + issueId + '/worklog?adjustEstimate=auto',
        data, callback
      );
    };

    /**
     * Perform a transition on an issue
     *
     * @param {Number} issueId
     * @param {Object} data
     * @param {Function} callback
     */
    this.transitions = function (issueId, data, callback) {
      this._makeRequest(
        '/api/latest/issue/' + issueId + '/transitions?expand=transitions.fields',
        data, callback
      );
    };

    /**
     * Makes request with the data set
     *
     * @param {String} urn
     * @param {Object} dataSet
     * @param {Function} callback
     * @private
     */
    this._makeRequest = function (urn, dataSet, callback) {
      // defaults
      var call,
        callOptions = {
          type: 'GET',
          url: cjSettings.account.url + '/rest' + urn,
          cache: false,
          data: dataSet,
          contentType: 'application/json; charset=UTF-8',
          dataType: 'json',
          timeout: cjSettings.account.timeout * 1000,
          headers: {
            Authorization: 'Basic ' +
              window.btoa(cjSettings.account.login + ':' + cjSettings.account.password)
          }
        };

      // different method
      if (callOptions.data._method) {
        callOptions.type = callOptions.data._method.toUpperCase();
        delete callOptions.data._method;
        callOptions.data = angular.toJson(callOptions.data);
      }

      // adding the HTTP Authorization
      if (cjSettings.account.http && cjSettings.account.http.login) {
        callOptions.username = cjSettings.account.http.login;
        callOptions.password = cjSettings.account.http.password || null;
      }

      // ajax object
      call = $.ajax(callOptions);

      // we are ok
      call.done(function (json) {
        return callback(null, json);
      });

      // something went wrong
      call.fail(function (err) {
        // defaults
        var messages = [
            'Unknown response from the JIRA&trade; API',
            'Please check the settings!'
          ],
          loginReason = err.getResponseHeader('X-Seraph-LoginReason'),
          loginReasonSet = {
            'AUTHENTICATION_DENIED': 'The user is not allowed to even attempt a login.',
            'AUTHENTICATED_FAILED': 'The user could not be authenticated.',
            'AUTHORISATION_FAILED': 'The user could not be authorised.',
            'OUT': 'The user has in fact logged "out"'
          };

        // error messages
        if (loginReason && err.status > 400 && err.status < 500) {
          messages = [loginReasonSet[loginReason]];
        } else if (err.status === 500) {
          messages = [
            'Check the JIRA&trade; configuration. Make sure the "Allow Remote API Calls"' +
            ' is turned ON under Administration > General Configuration.'
          ];
        } else {
          if (err.responseText) {
            try {
              messages = angular.fromJson(err.responseText).errorMessages;
            } catch (e) {
              // nothing here, default message shown
            }
          }
        }

        // debug information
        console.error(err);

        // custom message
        $rootScope.$emit('jiraRequestFail', [err.statusText, messages]);

        // lets notice parents
        return callback(err);
      });
    };
  });
