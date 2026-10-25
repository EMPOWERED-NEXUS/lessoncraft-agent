import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.Statement;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * One read-only Lightning SQL statement per process.
 * Credentials come from the environment. They are never printed.
 */
public final class LightningQuery {
  private static final Pattern WRITE =
      Pattern.compile(
          "\\b(CREATE|DROP|INSERT|UPDATE|DELETE|ALTER|GRANT|REVOKE|CACHE|COMPILE|ACTIVATE|REMOVE|TRUNCATE|MERGE|REPLACE|UPSERT)\\b",
          Pattern.CASE_INSENSITIVE);

  private LightningQuery() {}

  public static void main(String[] args) throws Exception {
    if (args.length != 1) {
      System.err.println("Expected exactly one SQL argument.");
      System.exit(2);
    }
    String sql = oneReadStatement(args[0]);
    String url = env("ZETARIS_JDBC_URL");
    String user = env("ZETARIS_JDBC_USER");
    String password = env("ZETARIS_JDBC_PASSWORD");
    if (url.isEmpty() || user.isEmpty() || password.isEmpty()) {
      System.err.println("JDBC url, user, and password must be set in the environment.");
      System.exit(2);
    }
    Class.forName("com.zetaris.lightning.jdbc.LightningDriver");
    try (Connection connection = DriverManager.getConnection(url, user, password);
        Statement statement = connection.createStatement()) {
      statement.setMaxRows(200);
      boolean hasResult = statement.execute(sql);
      if (!hasResult) {
        System.out.println("{\"columns\":[],\"rows\":[],\"rowCount\":0,\"updateCount\":" + statement.getUpdateCount() + "}");
        return;
      }
      try (ResultSet rs = statement.getResultSet()) {
        System.out.println(toJson(rs));
      }
    }
  }

  static String oneReadStatement(String raw) {
    String stripped = raw.replaceAll("/\\*[\\s\\S]*?\\*/", " ").replaceAll("--[^\\n]*", " ").trim();
    if (stripped.endsWith(";")) stripped = stripped.substring(0, stripped.length() - 1).trim();
    if (stripped.isEmpty() || stripped.indexOf(';') >= 0) {
      throw new IllegalArgumentException("Read-only JDBC client accepts exactly one SQL statement.");
    }
    String first = stripped.split("\\s+")[0].toUpperCase(Locale.ROOT);
    if (!first.equals("SELECT") && !first.equals("SHOW") && !first.equals("DESCRIBE") && !first.equals("DESC") && !first.equals("EXPLAIN")) {
      throw new IllegalArgumentException("Rejected SQL starting with " + first + ".");
    }
    if (WRITE.matcher(stripped).find()) {
      throw new IllegalArgumentException("Rejected a statement that looks like a write.");
    }
    return stripped;
  }

  private static String env(String key) {
    String value = System.getenv(key);
    return value == null ? "" : value.trim();
  }

  private static String toJson(ResultSet rs) throws Exception {
    ResultSetMetaData meta = rs.getMetaData();
    int columns = meta.getColumnCount();
    StringBuilder out = new StringBuilder();
    out.append("{\"columns\":[");
    for (int i = 1; i <= columns; i++) {
      if (i > 1) out.append(',');
      out.append('"').append(escape(meta.getColumnLabel(i))).append('"');
    }
    out.append("],\"rows\":[");
    int count = 0;
    while (rs.next()) {
      if (count > 0) out.append(',');
      out.append('{');
      for (int i = 1; i <= columns; i++) {
        if (i > 1) out.append(',');
        Object value = rs.getObject(i);
        out.append('"').append(escape(meta.getColumnLabel(i))).append("\":");
        if (value == null) out.append("null");
        else out.append('"').append(escape(String.valueOf(value))).append('"');
      }
      out.append('}');
      count++;
    }
    out.append("],\"rowCount\":").append(count).append('}');
    return out.toString();
  }

  private static String escape(String value) {
    return value
        .replace("\\", "\\\\")
        .replace("\"", "\\\"")
        .replace("\n", "\\n")
        .replace("\r", "\\r");
  }
}
