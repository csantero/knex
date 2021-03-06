// SQLite3 Query Builder & Compiler
// -------
module.exports = function(client) {

var _        = require('lodash');
var inherits = require('inherits');

var QueryBuilder  = require('../../query/builder');
var QueryCompiler = require('../../query/compiler');

// Query Builder
// -------
function QueryBuilder_SQLite3() {
  this.client = client;
  QueryBuilder.apply(this, arguments);
}
inherits(QueryBuilder_SQLite3, QueryBuilder);

// Query Compiler
// -------
function QueryCompiler_SQLite3() {
  this.formatter = new client.Formatter();
  QueryCompiler.apply(this, arguments);
}
inherits(QueryCompiler_SQLite3, QueryCompiler);

// The locks are not applicable in SQLite3
QueryCompiler_SQLite3.prototype.forShare =
QueryCompiler_SQLite3.prototype.forUpdate = function() {
  return '';
};

// SQLite requires us to build the multi-row insert as a listing of select with
// unions joining them together. So we'll build out this list of columns and
// then join them all together with select unions to complete the queries.
QueryCompiler_SQLite3.prototype.insert = function() {
  var insert = this.single.insert;
  var sql = 'insert into ' + this.tableName + ' ';
  if (_.isEmpty(this.single.insert)) return sql + 'default values';
  var insertData = this._prepInsert(insert);
  sql += '(' + this.formatter.columnize(insertData.columns) + ')';
  if (insertData.values.length === 1) {
    return sql + ' values (' + this.formatter.parameterize(insertData.values[0]) + ')';
  }
  var blocks = [];
  for (var i = 0, l = insertData.values.length; i < l; i++) {
    var block = blocks[i] = [];
    var current = insertData.values[i];
    for (var i2 = 0, l2 = insertData.columns.length; i2 < l2; i2++) {
      block.push(this.formatter.parameter(current[i2]) + ' as ' + this.formatter.wrap(insertData.columns[i2]));
    }
    blocks[i] = block.join(', ');
  }
  return sql + ' select ' + blocks.join(' union all select ');
};

// Adds a `order by` clause to the query, using "collate nocase" for the sort.
QueryCompiler_SQLite3.prototype.order = function() {
  var orders = this.grouped.order;
  if (!orders) return '';
  return _.map(orders, function(order) {
    var cols = _.isArray(order.value) ? order.value : [order.value];
    return 'order by ' + this.formatter.columnize(cols) + ' collate nocase ' + this.formatter.direction(order.direction);
  }, this);
};

// Compiles an `update` query.
QueryCompiler_SQLite3.prototype.update = function() {
  var updateData = this._prepUpdate(this.single.update);
  var joins      = this.join();
  var wheres     = this.where();
  return 'update ' + this.tableName +
    (joins ? ' ' + joins : '') +
    ' set ' + updateData.join(', ') +
    (wheres ? ' ' + wheres : '');
};

// Compile a truncate table statement into SQL.
QueryCompiler_SQLite3.prototype.truncate = function() {
  var table = this.tableName;
  return {
    sql: 'delete from sqlite_sequence where name = ' + this.tableName,
    output: function() {
      return this.query({sql: 'delete from ' + table});
    }
  };
};

// Compiles a `columnInfo` query
QueryCompiler_SQLite3.prototype.columnInfo = function() {
  var column = this.single.columnInfo;
  return {
    sql: 'PRAGMA table_info(' + this.single.table +')',
    output: function(resp) {
      var maxLengthRegex = /.*\((\d+)\)/;
      var out = _.reduce(resp, function (columns, val) {
        var type = val.type;
        var maxLength = (maxLength = type.match(maxLengthRegex)) && maxLength[1];
        type = maxLength ? type.split('(')[0] : type;
        columns[val.name] = {
          type: type.toLowerCase(),
          maxLength: maxLength,
          nullable: !val.notnull,
          defaultValue: val.dflt_value
        };
        return columns;
      }, {});
      return column && out[column] || out;
    }
  };
};

client.QueryBuilder = QueryBuilder_SQLite3;
client.QueryCompiler = QueryCompiler_SQLite3;

};