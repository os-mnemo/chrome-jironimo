/**
 * chrome-jironimo
 *
 * @author Kanstantsin Kamkou <2ka.by>
 * @{@link http://github.com/kkamkou/chrome-jironimo}
 * @license http://opensource.org/licenses/BSL-1.0 Boost Software License 1.0
 */

angular
  .module('jironimo')
  .controller(
    'IndexController',
    function ($q, $timeout, $rootScope, $scope, cjTimer, cjSettings, cjNotifications, cjJira) {
      var self = this;

      $scope.timer = cjTimer;
      $scope.workspaces = cjSettings.workspaces;

      $scope.issues = [];
      $scope.searchTotal = 0;
      $scope.searchStartAt = 0;
      $scope.searchMaxResults = 16;

      $scope.loading = false;
      $scope.windowDetached = false;

      // init
      $scope.$on('$routeChangeSuccess', function () {
        if (!cjSettings.account.url || !cjSettings.account.login) {
          $scope.tabSettings();
          return;
        }

        chrome.windows.getCurrent(null, function (win) {
          $scope.windowDetached = (win.type === 'popup');
        });
      });

      // the active workspace
      $scope.workspaceActive = _.find($scope.workspaces, function (dataSet, index, list) {
        if (_.isNumber(cjSettings.workspaceLast) && list.length >= cjSettings.workspaceLast) {
          return (cjSettings.workspaceLast === index);
        }
        return dataSet.isDefault;
      });

      /**
       * Loads issues for an another workspace
       * @param {Integer} offset
       * @param {Integer} limit
       * @return {void}
       */
      $scope.workspaceRefresh = function (offset, limit) {
        $scope.loading = true;
        $scope.issues = [];

        if (angular.isUndefined(offset)) {
          offset = $scope.searchStartAt;
        }

        if (angular.isUndefined(limit)) {
          limit = $scope.searchMaxResults;
        }

        self._issueSearch($scope.workspaceActive.query, +offset, +limit)
          .then(
            function (data) {
              $scope.loading = false;
              $scope.searchTotal = data.total;
              $scope.searchStartAt = data.startAt;

              angular.forEach(data.issues, function (issue) {
                $scope.issues.push(self._issueModify(issue));
              });
            },
            function () {
              $scope.loading = false;
            }
          );

        if (cjSettings.timer.workspace > 0) {
          setTimeout(
            $scope.workspaceRefresh,
            parseInt(cjSettings.timer.workspace, 10) * 1000 * 60
          );
        }
      };

      /**
       * Marks another workspace as active
       * @param {Number} index
       */
      $scope.workspaceSwitchTo = function (index) {
        index = $scope.workspaces[index] ? index : 0;

        $scope.workspaceActive = $scope.workspaces[index];
        $scope.workspaceRefresh();

        if (cjSettings.workspaceLast !== index) {
          cjSettings.workspaceLast = index;
        }
      };

      /**
       * Calculates the previous page number
       * @return {Integer}
       */
      $scope.searchOffsetBackward = function () {
        var pos = $scope.searchStartAt - $scope.searchMaxResults;
        return (pos < 0 ? 0 : pos);
      };

      /**
       * Calculates the next page number
       * @return {Integer}
       */
      $scope.searchOffsetForward = function () {
        var pos = $scope.searchStartAt + $scope.searchMaxResults;
        return (pos > $scope.searchTotal ? $scope.searchTotal - 1 : pos);
      };

      /**
       * Executes transition for the current ticket
       * @param {Object} issue
       * @param {Object} transition
       * @return {void}
       */
      $scope.transition = function (issue, transition) {
        if (!issue) {
          $(event.target).parent().hide();
          return false;
        }

        var dataSet = {
          _method: 'POST',
          transition: {id: transition.id}
        };

        cjJira.transitions(issue.id, dataSet, function (err) {
          if (!err) {
            $scope.workspaceRefresh();
          }
        });
      };

      /**
       * Opens this extension in a new window
       * @return {void}
       */
      $scope.windowDetach = function () {
        if ($scope.windowDetached) { return; }
        var w = 1024, h = 768;
        chrome.windows.create(
          {
            url: 'views/default.html',
            type: 'popup',
            width: w,
            height: h,
            left: Math.round((screen.availWidth - w) / 2),
            top: Math.round((screen.availHeight - h) / 2)
          },
          function () {
            window.close();
          }
        );
      };

      /**
       * Opens the settings section in a new window
       * @return {void}
       */
      $scope.tabSettings = function () {
        chrome.tabs.create(
          {active: true, url: cjSettings.getOptionsPageUri()}
        );
      };

      /**
       * Opens JIRA with the issue link in a new window
       * @param {Object} issue
       * @return {void}
       */
      $scope.tabIssue = function (issue) {
        chrome.tabs.create({
          active: false,
          url: cjSettings.account.url + '/browse/' + issue.key
        });
      };

      /**
       * If an issue is assigned to nobody, we should assign it to us
       * @return {void}
       */
      $scope.issueTimerStart = function (issue) {
        if (issue.fields.assignee) {
          $scope.timer.start(issue);
          return;
        }

        cjJira.myself(function (err1, info) {
          if (err1) { return; }

          var paramsQuery = {_method: 'PUT', name: info.name},
          paramsNotify = {
            title: issue.key,
            message: 'The ticket was assigned to me'
          };

          cjJira.issueAssignee(issue.key, paramsQuery, function (err2) {
            if (err2) { return; }

            cjNotifications.createOrUpdate(issue.key, paramsNotify, function () {
              $scope.$apply(function () {
                $scope.timer.start(issue);
              });
            });
          });
        });
      };

      /**
       * Entry set corrections
       * @private
       * @param {Object} issue
       * @return {Object}
       */
      this._issueModify = function (issue) {
        issue._isClosed = (issue.fields.status.name === 'Closed');
        issue._colors = cjSettings.colors.priority[0];

        if (issue.fields.timeestimate) {
          issue.fields.timeestimate = moment.duration(issue.fields.timeestimate * 1000).humanize();
        }

        issue._size = cjSettings.colors
          .sizes[issue.fields.issuetype.name.toLowerCase()] || cjSettings.colors
          .sizes.task;

        if (issue.fields.priority && cjSettings.colors.priority[issue.fields.priority.id]) {
          issue._colors = cjSettings.colors.priority[issue.fields.priority.id];
        }

        return issue;
      };

      /**
       * Loads issues from the API
       * @private
       * @param {String} query
       * @param {Number} offset
       * @param {Number} limit
       * @return {Object}
       */
      this._issueSearch = function (query, offset, limit) {
        var deferred = $q.defer(),
          searchData = {
            jql: query,
            startAt: +offset,
            maxResults: +limit,
            expand: 'transitions',
            fields: '*navigable'
          };

        cjJira.myself(function (err, flag) {
          if (err || !flag) {
            if (err) {
              deferred.reject(err);
            }
            return false;
          }

          cjJira.search(searchData, function (serr, data) {
            return serr ? deferred.reject(serr) : deferred.resolve(data);
          });
        });

        return deferred.promise;
      };

      // DOM playground (should be moved somewhere)
      $scope.$on('$viewContentLoaded', function () {
        var $tiles = $('div.tiles');

        $tiles.on('click', 'div.tile', function () {
          $tiles.find('div.toolbar:visible').slideUp('fast');
          $(this).find('div.toolbar:not(:visible)').slideDown('fast');
          return false;
        });

        $tiles.on('click', 'button.transitions', function () {
          $(this).closest('div.tile').find('div.transitions').show();
          return false;
        });

        $scope.workspaceRefresh();
      });

      $scope.$watch('filterFieldDisplay', function (value) {
        if (!value) { return; }
        $timeout(function () {
          $('#filter input').focus();
        }, 100);
      });

      $scope.$watch('loading', function (value) {
        if (!value) { return; }
        $scope.jiraRequestFailed = false;
        $scope.filterFieldDisplay = false;
      });

      $rootScope.$on('jiraRequestFail', function (event, args) {
        $scope.jiraRequestFailed = [S(args[0]).capitalize().s, args[1].join('; ')];
      });
    }
  );
