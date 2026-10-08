package com.financialmonitoring.app;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

public class FinanceDatabase extends SQLiteOpenHelper {
    private static final String DB_NAME = "financial_monitoring.db";
    private static final int DB_VERSION = 3;

    public FinanceDatabase(Context context) {
        super(context, DB_NAME, null, DB_VERSION);
    }

    @Override
    public void onConfigure(SQLiteDatabase db) {
        super.onConfigure(db);
        db.setForeignKeyConstraintsEnabled(true);
    }

    @Override
    public void onCreate(SQLiteDatabase db) {
        createCoreTables(db);
        createMovementTable(db);
        createIndexes(db);
    }

    @Override
    public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
        if (oldVersion < 2) {
            createMovementTable(db);
            createMovementIndexes(db);
            migrateV1PaymentsToMovements(db);
        }
        if (oldVersion < 3) {
            db.execSQL("ALTER TABLE paycards ADD COLUMN allowance REAL NOT NULL DEFAULT 0");
        }
    }

    private void createCoreTables(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE IF NOT EXISTS paycards (" +
                "id INTEGER PRIMARY KEY AUTOINCREMENT," +
                "payday_date TEXT NOT NULL," +
                "net_pay REAL NOT NULL DEFAULT 0," +
                "allowance REAL NOT NULL DEFAULT 0," +
                "created_at TEXT NOT NULL," +
                "updated_at TEXT NOT NULL)");

        db.execSQL("CREATE TABLE IF NOT EXISTS expenses (" +
                "id INTEGER PRIMARY KEY AUTOINCREMENT," +
                "paycard_id INTEGER NOT NULL," +
                "name TEXT NOT NULL," +
                "amount_due REAL NOT NULL DEFAULT 0," +
                "due_date TEXT," +
                "amount_paid REAL NOT NULL DEFAULT 0," +
                "created_at TEXT NOT NULL," +
                "updated_at TEXT NOT NULL," +
                "FOREIGN KEY(paycard_id) REFERENCES paycards(id) ON DELETE CASCADE)");

        db.execSQL("CREATE TABLE IF NOT EXISTS freelance_cards (" +
                "id INTEGER PRIMARY KEY AUTOINCREMENT," +
                "income_date TEXT NOT NULL," +
                "project_name TEXT NOT NULL," +
                "client_name TEXT," +
                "amount_received REAL NOT NULL DEFAULT 0," +
                "created_at TEXT NOT NULL," +
                "updated_at TEXT NOT NULL)");

        db.execSQL("CREATE TABLE IF NOT EXISTS freelance_expenses (" +
                "id INTEGER PRIMARY KEY AUTOINCREMENT," +
                "freelance_card_id INTEGER NOT NULL," +
                "name TEXT NOT NULL," +
                "amount_due REAL NOT NULL DEFAULT 0," +
                "due_date TEXT," +
                "amount_paid REAL NOT NULL DEFAULT 0," +
                "created_at TEXT NOT NULL," +
                "updated_at TEXT NOT NULL," +
                "FOREIGN KEY(freelance_card_id) REFERENCES freelance_cards(id) ON DELETE CASCADE)");

        db.execSQL("CREATE TABLE IF NOT EXISTS receivables (" +
                "id INTEGER PRIMARY KEY AUTOINCREMENT," +
                "person_name TEXT NOT NULL," +
                "amount_owed REAL NOT NULL DEFAULT 0," +
                "date_owed TEXT NOT NULL," +
                "due_date TEXT," +
                "description TEXT," +
                "amount_received REAL NOT NULL DEFAULT 0," +
                "created_at TEXT NOT NULL," +
                "updated_at TEXT NOT NULL)");

        db.execSQL("CREATE TABLE IF NOT EXISTS history (" +
                "id INTEGER PRIMARY KEY AUTOINCREMENT," +
                "entity_type TEXT NOT NULL," +
                "entity_id INTEGER," +
                "action TEXT NOT NULL," +
                "summary TEXT NOT NULL," +
                "details_json TEXT," +
                "created_at TEXT NOT NULL)");
    }

    private void createMovementTable(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE IF NOT EXISTS cash_movements (" +
                "id INTEGER PRIMARY KEY AUTOINCREMENT," +
                "kind TEXT NOT NULL," +
                "source_type TEXT NOT NULL," +
                "source_id INTEGER NOT NULL," +
                "parent_type TEXT," +
                "parent_id INTEGER," +
                "amount REAL NOT NULL," +
                "movement_date TEXT NOT NULL," +
                "note TEXT," +
                "created_at TEXT NOT NULL)");
    }

    private void createIndexes(SQLiteDatabase db) {
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_paycards_date ON paycards(payday_date)");
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_expenses_paycard ON expenses(paycard_id)");
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_freelance_date ON freelance_cards(income_date)");
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_freelance_expenses_card ON freelance_expenses(freelance_card_id)");
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_receivables_date ON receivables(date_owed)");
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_history_created ON history(created_at)");
        createMovementIndexes(db);
    }

    private void createMovementIndexes(SQLiteDatabase db) {
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_movements_date ON cash_movements(movement_date)");
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_movements_source ON cash_movements(source_type,source_id)");
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_movements_parent ON cash_movements(parent_type,parent_id)");
    }

    private void migrateV1PaymentsToMovements(SQLiteDatabase db) {
        try (Cursor c = db.rawQuery("SELECT id,paycard_id,name,amount_paid,updated_at FROM expenses WHERE amount_paid != 0", null)) {
            while (c.moveToNext()) {
                insertMovement(db, "expense_payment", "payday_expense", c.getLong(0), "payday", c.getLong(1),
                        -c.getDouble(3), datePart(c.getString(4)), "Migrated payment: " + c.getString(2));
            }
        }
        try (Cursor c = db.rawQuery("SELECT id,freelance_card_id,name,amount_paid,updated_at FROM freelance_expenses WHERE amount_paid != 0", null)) {
            while (c.moveToNext()) {
                insertMovement(db, "expense_payment", "freelance_expense", c.getLong(0), "freelance", c.getLong(1),
                        -c.getDouble(3), datePart(c.getString(4)), "Migrated payment: " + c.getString(2));
            }
        }
        try (Cursor c = db.rawQuery("SELECT id,person_name,amount_received,updated_at FROM receivables WHERE amount_received != 0", null)) {
            while (c.moveToNext()) {
                insertMovement(db, "receivable_repayment", "receivable", c.getLong(0), "receivable", c.getLong(0),
                        c.getDouble(2), datePart(c.getString(3)), "Migrated repayment: " + c.getString(1));
            }
        }
    }

    private String now() {
        return new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US).format(new Date());
    }

    private String today() {
        return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
    }

    private String datePart(String value) {
        if (value == null || value.length() < 10) return today();
        return value.substring(0, 10);
    }

    private void log(SQLiteDatabase db, String type, Long entityId, String action, String summary, String details) {
        ContentValues v = new ContentValues();
        v.put("entity_type", type);
        if (entityId == null) v.putNull("entity_id"); else v.put("entity_id", entityId);
        v.put("action", action);
        v.put("summary", summary);
        v.put("details_json", details == null ? "{}" : details);
        v.put("created_at", now());
        db.insert("history", null, v);
    }

    private void insertMovement(SQLiteDatabase db, String kind, String sourceType, long sourceId,
                                String parentType, Long parentId, double amount, String movementDate, String note) {
        if (Math.abs(amount) < 0.000001d) return;
        ContentValues v = new ContentValues();
        v.put("kind", kind);
        v.put("source_type", sourceType);
        v.put("source_id", sourceId);
        if (parentType == null) v.putNull("parent_type"); else v.put("parent_type", parentType);
        if (parentId == null) v.putNull("parent_id"); else v.put("parent_id", parentId);
        v.put("amount", amount);
        v.put("movement_date", movementDate == null || movementDate.trim().isEmpty() ? today() : movementDate);
        if (note == null) v.putNull("note"); else v.put("note", note);
        v.put("created_at", now());
        db.insertOrThrow("cash_movements", null, v);
    }

    private static String nullableString(JSONObject o, String key) {
        String s = o.optString(key, "").trim();
        return s.isEmpty() ? null : s;
    }

    private static double cleanMoney(double value) {
        if (Double.isNaN(value) || Double.isInfinite(value)) return 0;
        return Math.max(0, value);
    }

    public synchronized long createPaycard(String json) {
        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        try {
            JSONObject o = new JSONObject(json);
            String ts = now();
            ContentValues v = new ContentValues();
            v.put("payday_date", o.getString("paydayDate"));
            v.put("net_pay", cleanMoney(o.optDouble("netPay", 0)));
            v.put("allowance", cleanMoney(o.optDouble("allowance", 0)));
            v.put("created_at", ts);
            v.put("updated_at", ts);
            long id = db.insertOrThrow("paycards", null, v);
            JSONArray arr = o.optJSONArray("expenses");
            if (arr != null) {
                for (int i = 0; i < arr.length(); i++) insertExpense(db, id, arr.getJSONObject(i), ts);
            }
            log(db, "payday", id, "created", "Payday card created", paycardJson(db, id).toString());
            db.setTransactionSuccessful();
            return id;
        } catch (Exception e) {
            return -1;
        } finally {
            db.endTransaction();
        }
    }

    private long insertExpense(SQLiteDatabase db, long paycardId, JSONObject e, String ts) throws JSONException {
        ContentValues v = new ContentValues();
        v.put("paycard_id", paycardId);
        v.put("name", e.optString("name", "Expense").trim());
        v.put("amount_due", cleanMoney(e.optDouble("amountDue", 0)));
        String due = nullableString(e, "dueDate"); if (due == null) v.putNull("due_date"); else v.put("due_date", due);
        double initialPaid = cleanMoney(e.optDouble("amountPaid", 0));
        v.put("amount_paid", initialPaid);
        v.put("created_at", ts);
        v.put("updated_at", ts);
        long id = db.insertOrThrow("expenses", null, v);
        if (initialPaid > 0) insertMovement(db, "expense_payment", "payday_expense", id, "payday", paycardId,
                -initialPaid, today(), "Initial payment for " + e.optString("name", "Expense"));
        return id;
    }

    public synchronized boolean updatePaycard(long id, String json) {
        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        try {
            JSONObject before = paycardJson(db, id);
            if (before == null) return false;
            JSONObject o = new JSONObject(json);
            String ts = now();
            ContentValues v = new ContentValues();
            v.put("payday_date", o.getString("paydayDate"));
            v.put("net_pay", cleanMoney(o.optDouble("netPay", 0)));
            v.put("allowance", cleanMoney(o.optDouble("allowance", 0)));
            v.put("updated_at", ts);
            db.update("paycards", v, "id=?", new String[]{String.valueOf(id)});

            Set<Long> seen = new HashSet<>();
            JSONArray arr = o.optJSONArray("expenses");
            if (arr != null) {
                for (int i = 0; i < arr.length(); i++) {
                    JSONObject e = arr.getJSONObject(i);
                    long eid = e.optLong("id", 0);
                    if (eid > 0 && expenseBelongsTo(db, eid, id)) {
                        ContentValues ev = new ContentValues();
                        ev.put("name", e.optString("name", "Expense").trim());
                        ev.put("amount_due", cleanMoney(e.optDouble("amountDue", 0)));
                        String due = nullableString(e, "dueDate"); if (due == null) ev.putNull("due_date"); else ev.put("due_date", due);
                        ev.put("updated_at", ts);
                        db.update("expenses", ev, "id=?", new String[]{String.valueOf(eid)});
                        seen.add(eid);
                    } else {
                        long newId = insertExpense(db, id, e, ts);
                        seen.add(newId);
                    }
                }
            }
            deleteMissingExpenseChildren(db, id, seen);
            JSONObject after = paycardJson(db, id);
            JSONObject details = new JSONObject(); details.put("before", before); details.put("after", after);
            log(db, "payday", id, "edited", "Payday card edited", details.toString());
            db.setTransactionSuccessful();
            return true;
        } catch (Exception e) {
            return false;
        } finally {
            db.endTransaction();
        }
    }

    private boolean expenseBelongsTo(SQLiteDatabase db, long expenseId, long paycardId) {
        try (Cursor c = db.rawQuery("SELECT 1 FROM expenses WHERE id=? AND paycard_id=?", new String[]{String.valueOf(expenseId), String.valueOf(paycardId)})) {
            return c.moveToFirst();
        }
    }

    private void deleteMissingExpenseChildren(SQLiteDatabase db, long parentId, Set<Long> seen) {
        try (Cursor c = db.rawQuery("SELECT id,name,amount_paid FROM expenses WHERE paycard_id=?", new String[]{String.valueOf(parentId)})) {
            while (c.moveToNext()) {
                long childId = c.getLong(0);
                if (!seen.contains(childId)) {
                    JSONObject d = new JSONObject();
                    try { d.put("expenseId", childId); d.put("name", c.getString(1)); d.put("amountPaid", c.getDouble(2)); } catch (JSONException ignored) {}
                    log(db, "payday", parentId, "edited", "Expense removed from payday card", d.toString());
                    db.delete("cash_movements", "source_type=? AND source_id=?", new String[]{"payday_expense", String.valueOf(childId)});
                    db.delete("expenses", "id=?", new String[]{String.valueOf(childId)});
                }
            }
        }
    }

    public synchronized boolean deletePaycard(long id) {
        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        try {
            JSONObject snapshot = paycardJson(db, id);
            if (snapshot == null) return false;
            log(db, "payday", id, "deleted", "Payday card deleted", snapshot.toString());
            db.delete("cash_movements", "parent_type=? AND parent_id=?", new String[]{"payday", String.valueOf(id)});
            db.delete("paycards", "id=?", new String[]{String.valueOf(id)});
            db.setTransactionSuccessful();
            return true;
        } catch (Exception e) {
            return false;
        } finally {
            db.endTransaction();
        }
    }

    public synchronized boolean updateExpensePayment(long id, double amount) {
        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        try {
            double before; long parent; String name;
            try (Cursor c = db.rawQuery("SELECT paycard_id,name,amount_paid FROM expenses WHERE id=?", new String[]{String.valueOf(id)})) {
                if (!c.moveToFirst()) return false;
                parent = c.getLong(0); name = c.getString(1); before = c.getDouble(2);
            }
            double after = cleanMoney(amount);
            if (Math.abs(after - before) < 0.000001d) { db.setTransactionSuccessful(); return true; }
            ContentValues v = new ContentValues(); v.put("amount_paid", after); v.put("updated_at", now());
            db.update("expenses", v, "id=?", new String[]{String.valueOf(id)});
            double delta = after - before;
            insertMovement(db, "expense_payment", "payday_expense", id, "payday", parent, -delta, today(),
                    (delta >= 0 ? "Payment" : "Payment correction") + " for " + name);
            JSONObject d = new JSONObject(); d.put("expense", name); d.put("before", before); d.put("after", after); d.put("delta", delta); d.put("date", today());
            log(db, "payday", parent, "payment", "Payment updated for " + name, d.toString());
            db.setTransactionSuccessful();
            return true;
        } catch (Exception e) {
            return false;
        } finally {
            db.endTransaction();
        }
    }

    public synchronized long createFreelance(String json) {
        SQLiteDatabase db = getWritableDatabase(); db.beginTransaction();
        try {
            JSONObject o = new JSONObject(json); String ts = now(); ContentValues v = new ContentValues();
            v.put("income_date", o.getString("incomeDate")); v.put("project_name", o.getString("projectName").trim());
            String client = nullableString(o, "clientName"); if (client == null) v.putNull("client_name"); else v.put("client_name", client);
            v.put("amount_received", cleanMoney(o.optDouble("amountReceived", 0))); v.put("created_at", ts); v.put("updated_at", ts);
            long id = db.insertOrThrow("freelance_cards", null, v);
            JSONArray arr = o.optJSONArray("expenses"); if (arr != null) for (int i=0;i<arr.length();i++) insertFreelanceExpense(db,id,arr.getJSONObject(i),ts);
            log(db,"freelance",id,"created","Freelance income created",freelanceJson(db,id).toString()); db.setTransactionSuccessful(); return id;
        } catch(Exception e){ return -1; } finally { db.endTransaction(); }
    }

    private long insertFreelanceExpense(SQLiteDatabase db,long parent,JSONObject e,String ts)throws JSONException{
        ContentValues v=new ContentValues(); v.put("freelance_card_id",parent); v.put("name",e.optString("name","Expense").trim());
        v.put("amount_due",cleanMoney(e.optDouble("amountDue",0))); String due=nullableString(e,"dueDate"); if(due==null)v.putNull("due_date");else v.put("due_date",due);
        double initialPaid=cleanMoney(e.optDouble("amountPaid",0)); v.put("amount_paid",initialPaid); v.put("created_at",ts);v.put("updated_at",ts);
        long id=db.insertOrThrow("freelance_expenses",null,v);
        if(initialPaid>0)insertMovement(db,"expense_payment","freelance_expense",id,"freelance",parent,-initialPaid,today(),"Initial payment for "+e.optString("name","Expense"));
        return id;
    }

    public synchronized boolean updateFreelance(long id,String json){
        SQLiteDatabase db=getWritableDatabase(); db.beginTransaction();
        try{
            JSONObject before=freelanceJson(db,id); if(before==null)return false; JSONObject o=new JSONObject(json); String ts=now(); ContentValues v=new ContentValues();
            v.put("income_date",o.getString("incomeDate"));v.put("project_name",o.getString("projectName").trim());String client=nullableString(o,"clientName");if(client==null)v.putNull("client_name");else v.put("client_name",client);v.put("amount_received",cleanMoney(o.optDouble("amountReceived",0)));v.put("updated_at",ts);db.update("freelance_cards",v,"id=?",new String[]{String.valueOf(id)});
            Set<Long> seen=new HashSet<>();JSONArray arr=o.optJSONArray("expenses");if(arr!=null){for(int i=0;i<arr.length();i++){JSONObject e=arr.getJSONObject(i);long eid=e.optLong("id",0);if(eid>0&&freelanceExpenseBelongsTo(db,eid,id)){ContentValues ev=new ContentValues();ev.put("name",e.optString("name","Expense").trim());ev.put("amount_due",cleanMoney(e.optDouble("amountDue",0)));String due=nullableString(e,"dueDate");if(due==null)ev.putNull("due_date");else ev.put("due_date",due);ev.put("updated_at",ts);db.update("freelance_expenses",ev,"id=?",new String[]{String.valueOf(eid)});seen.add(eid);}else{seen.add(insertFreelanceExpense(db,id,e,ts));}}}
            deleteMissingFreelanceChildren(db,id,seen);JSONObject after=freelanceJson(db,id);JSONObject d=new JSONObject();d.put("before",before);d.put("after",after);log(db,"freelance",id,"edited","Freelance income edited",d.toString());db.setTransactionSuccessful();return true;
        }catch(Exception e){return false;}finally{db.endTransaction();}
    }

    private boolean freelanceExpenseBelongsTo(SQLiteDatabase db,long expenseId,long parent){try(Cursor c=db.rawQuery("SELECT 1 FROM freelance_expenses WHERE id=? AND freelance_card_id=?",new String[]{String.valueOf(expenseId),String.valueOf(parent)})){return c.moveToFirst();}}

    private void deleteMissingFreelanceChildren(SQLiteDatabase db,long parentId,Set<Long> seen){
        try(Cursor c=db.rawQuery("SELECT id,name,amount_paid FROM freelance_expenses WHERE freelance_card_id=?",new String[]{String.valueOf(parentId)})){
            while(c.moveToNext()){long childId=c.getLong(0);if(!seen.contains(childId)){JSONObject d=new JSONObject();try{d.put("expenseId",childId);d.put("name",c.getString(1));d.put("amountPaid",c.getDouble(2));}catch(JSONException ignored){}log(db,"freelance",parentId,"edited","Expense removed from freelance card",d.toString());db.delete("cash_movements","source_type=? AND source_id=?",new String[]{"freelance_expense",String.valueOf(childId)});db.delete("freelance_expenses","id=?",new String[]{String.valueOf(childId)});}}
        }
    }

    public synchronized boolean deleteFreelance(long id){SQLiteDatabase db=getWritableDatabase();db.beginTransaction();try{JSONObject snapshot=freelanceJson(db,id);if(snapshot==null)return false;log(db,"freelance",id,"deleted","Freelance income deleted",snapshot.toString());db.delete("cash_movements","parent_type=? AND parent_id=?",new String[]{"freelance",String.valueOf(id)});db.delete("freelance_cards","id=?",new String[]{String.valueOf(id)});db.setTransactionSuccessful();return true;}catch(Exception e){return false;}finally{db.endTransaction();}}

    public synchronized boolean updateFreelanceExpensePayment(long id,double amount){
        SQLiteDatabase db=getWritableDatabase();db.beginTransaction();
        try{double before;long parent;String name;try(Cursor c=db.rawQuery("SELECT freelance_card_id,name,amount_paid FROM freelance_expenses WHERE id=?",new String[]{String.valueOf(id)})){if(!c.moveToFirst())return false;parent=c.getLong(0);name=c.getString(1);before=c.getDouble(2);}double after=cleanMoney(amount);if(Math.abs(after-before)<0.000001d){db.setTransactionSuccessful();return true;}ContentValues v=new ContentValues();v.put("amount_paid",after);v.put("updated_at",now());db.update("freelance_expenses",v,"id=?",new String[]{String.valueOf(id)});double delta=after-before;insertMovement(db,"expense_payment","freelance_expense",id,"freelance",parent,-delta,today(),(delta>=0?"Payment":"Payment correction")+" for "+name);JSONObject d=new JSONObject();d.put("expense",name);d.put("before",before);d.put("after",after);d.put("delta",delta);d.put("date",today());log(db,"freelance",parent,"payment","Freelance expense payment updated for "+name,d.toString());db.setTransactionSuccessful();return true;}catch(Exception e){return false;}finally{db.endTransaction();}
    }

    public synchronized long createReceivable(String json){
        SQLiteDatabase db=getWritableDatabase();db.beginTransaction();
        try{JSONObject o=new JSONObject(json);String ts=now();ContentValues v=receivableValues(o,ts,true);long id=db.insertOrThrow("receivables",null,v);double received=cleanMoney(o.optDouble("amountReceived",0));if(received>0)insertMovement(db,"receivable_repayment","receivable",id,"receivable",id,received,today(),"Initial repayment from "+o.optString("personName","receivable"));log(db,"receivable",id,"created","Money owed to me entry created",receivableJson(db,id).toString());db.setTransactionSuccessful();return id;}catch(Exception e){return -1;}finally{db.endTransaction();}
    }

    private ContentValues receivableValues(JSONObject o,String ts,boolean created)throws JSONException{ContentValues v=new ContentValues();v.put("person_name",o.getString("personName").trim());v.put("amount_owed",cleanMoney(o.optDouble("amountOwed",0)));v.put("date_owed",o.getString("dateOwed"));String due=nullableString(o,"dueDate");if(due==null)v.putNull("due_date");else v.put("due_date",due);String desc=nullableString(o,"description");if(desc==null)v.putNull("description");else v.put("description",desc);v.put("amount_received",cleanMoney(o.optDouble("amountReceived",0)));if(created)v.put("created_at",ts);v.put("updated_at",ts);return v;}

    public synchronized boolean updateReceivable(long id,String json){
        SQLiteDatabase db=getWritableDatabase();db.beginTransaction();
        try{JSONObject before=receivableJson(db,id);if(before==null)return false;JSONObject o=new JSONObject(json);double beforeReceived=before.optDouble("amountReceived",0);db.update("receivables",receivableValues(o,now(),false),"id=?",new String[]{String.valueOf(id)});JSONObject after=receivableJson(db,id);double afterReceived=after.optDouble("amountReceived",0);if(Math.abs(beforeReceived-afterReceived)>0.000001d){double delta=afterReceived-beforeReceived;insertMovement(db,"receivable_repayment","receivable",id,"receivable",id,delta,today(),(delta>=0?"Repayment":"Repayment correction")+" from "+after.optString("personName","receivable"));JSONObject pd=new JSONObject();pd.put("before",beforeReceived);pd.put("after",afterReceived);pd.put("delta",delta);pd.put("date",today());log(db,"receivable",id,"payment","Repayment updated for "+after.optString("personName","receivable"),pd.toString());}JSONObject details=new JSONObject();details.put("before",before);details.put("after",after);log(db,"receivable",id,"edited","Money owed to me entry edited",details.toString());db.setTransactionSuccessful();return true;}catch(Exception e){return false;}finally{db.endTransaction();}
    }

    public synchronized boolean deleteReceivable(long id){SQLiteDatabase db=getWritableDatabase();db.beginTransaction();try{JSONObject snapshot=receivableJson(db,id);if(snapshot==null)return false;log(db,"receivable",id,"deleted","Money owed to me entry deleted",snapshot.toString());db.delete("cash_movements","parent_type=? AND parent_id=?",new String[]{"receivable",String.valueOf(id)});db.delete("receivables","id=?",new String[]{String.valueOf(id)});db.setTransactionSuccessful();return true;}catch(Exception e){return false;}finally{db.endTransaction();}}

    public synchronized String getSnapshot(){
        SQLiteDatabase db=getReadableDatabase();
        try{JSONObject root=new JSONObject();root.put("paycards",queryPaycards(db));root.put("freelance",queryFreelance(db));root.put("receivables",queryReceivables(db));root.put("history",queryHistory(db));root.put("movements",queryMovements(db));return root.toString();}
        catch(Exception e){return "{\"paycards\":[],\"freelance\":[],\"receivables\":[],\"history\":[],\"movements\":[],\"error\":\"snapshot_failed\"}";}
    }

    private JSONArray queryPaycards(SQLiteDatabase db)throws JSONException{JSONArray a=new JSONArray();try(Cursor c=db.rawQuery("SELECT id,payday_date,net_pay,allowance,created_at,updated_at FROM paycards ORDER BY payday_date DESC,id DESC",null)){while(c.moveToNext()){JSONObject o=new JSONObject();long id=c.getLong(0);o.put("id",id);o.put("paydayDate",c.getString(1));o.put("netPay",c.getDouble(2));o.put("allowance",c.getDouble(3));o.put("createdAt",c.getString(4));o.put("updatedAt",c.getString(5));o.put("expenses",queryExpenses(db,id));a.put(o);}}return a;}
    private JSONArray queryExpenses(SQLiteDatabase db,long parent)throws JSONException{JSONArray a=new JSONArray();try(Cursor c=db.rawQuery("SELECT id,name,amount_due,due_date,amount_paid,created_at,updated_at FROM expenses WHERE paycard_id=? ORDER BY id",new String[]{String.valueOf(parent)})){while(c.moveToNext()){JSONObject o=new JSONObject();o.put("id",c.getLong(0));o.put("name",c.getString(1));o.put("amountDue",c.getDouble(2));o.put("dueDate",c.isNull(3)?JSONObject.NULL:c.getString(3));o.put("amountPaid",c.getDouble(4));o.put("createdAt",c.getString(5));o.put("updatedAt",c.getString(6));a.put(o);}}return a;}
    private JSONArray queryFreelance(SQLiteDatabase db)throws JSONException{JSONArray a=new JSONArray();try(Cursor c=db.rawQuery("SELECT id,income_date,project_name,client_name,amount_received,created_at,updated_at FROM freelance_cards ORDER BY income_date DESC,id DESC",null)){while(c.moveToNext()){JSONObject o=new JSONObject();long id=c.getLong(0);o.put("id",id);o.put("incomeDate",c.getString(1));o.put("projectName",c.getString(2));o.put("clientName",c.isNull(3)?JSONObject.NULL:c.getString(3));o.put("amountReceived",c.getDouble(4));o.put("createdAt",c.getString(5));o.put("updatedAt",c.getString(6));o.put("expenses",queryFreelanceExpenses(db,id));a.put(o);}}return a;}
    private JSONArray queryFreelanceExpenses(SQLiteDatabase db,long parent)throws JSONException{JSONArray a=new JSONArray();try(Cursor c=db.rawQuery("SELECT id,name,amount_due,due_date,amount_paid,created_at,updated_at FROM freelance_expenses WHERE freelance_card_id=? ORDER BY id",new String[]{String.valueOf(parent)})){while(c.moveToNext()){JSONObject o=new JSONObject();o.put("id",c.getLong(0));o.put("name",c.getString(1));o.put("amountDue",c.getDouble(2));o.put("dueDate",c.isNull(3)?JSONObject.NULL:c.getString(3));o.put("amountPaid",c.getDouble(4));o.put("createdAt",c.getString(5));o.put("updatedAt",c.getString(6));a.put(o);}}return a;}
    private JSONArray queryReceivables(SQLiteDatabase db)throws JSONException{JSONArray a=new JSONArray();try(Cursor c=db.rawQuery("SELECT id,person_name,amount_owed,date_owed,due_date,description,amount_received,created_at,updated_at FROM receivables ORDER BY date_owed DESC,id DESC",null)){while(c.moveToNext()){JSONObject o=new JSONObject();o.put("id",c.getLong(0));o.put("personName",c.getString(1));o.put("amountOwed",c.getDouble(2));o.put("dateOwed",c.getString(3));o.put("dueDate",c.isNull(4)?JSONObject.NULL:c.getString(4));o.put("description",c.isNull(5)?JSONObject.NULL:c.getString(5));o.put("amountReceived",c.getDouble(6));o.put("createdAt",c.getString(7));o.put("updatedAt",c.getString(8));a.put(o);}}return a;}
    private JSONArray queryHistory(SQLiteDatabase db)throws JSONException{JSONArray a=new JSONArray();try(Cursor c=db.rawQuery("SELECT id,entity_type,entity_id,action,summary,details_json,created_at FROM history ORDER BY id DESC LIMIT 2000",null)){while(c.moveToNext()){JSONObject o=new JSONObject();o.put("id",c.getLong(0));o.put("entityType",c.getString(1));o.put("entityId",c.isNull(2)?JSONObject.NULL:c.getLong(2));o.put("action",c.getString(3));o.put("summary",c.getString(4));String d=c.getString(5);try{o.put("details",new JSONObject(d));}catch(Exception ignore){o.put("detailsRaw",d);}o.put("createdAt",c.getString(6));a.put(o);}}return a;}
    private JSONArray queryMovements(SQLiteDatabase db)throws JSONException{JSONArray a=new JSONArray();try(Cursor c=db.rawQuery("SELECT id,kind,source_type,source_id,parent_type,parent_id,amount,movement_date,note,created_at FROM cash_movements ORDER BY id DESC",null)){while(c.moveToNext()){JSONObject o=new JSONObject();o.put("id",c.getLong(0));o.put("kind",c.getString(1));o.put("sourceType",c.getString(2));o.put("sourceId",c.getLong(3));o.put("parentType",c.isNull(4)?JSONObject.NULL:c.getString(4));o.put("parentId",c.isNull(5)?JSONObject.NULL:c.getLong(5));o.put("amount",c.getDouble(6));o.put("movementDate",c.getString(7));o.put("note",c.isNull(8)?JSONObject.NULL:c.getString(8));o.put("createdAt",c.getString(9));a.put(o);}}return a;}

    private JSONObject paycardJson(SQLiteDatabase db,long id)throws JSONException{try(Cursor c=db.rawQuery("SELECT id,payday_date,net_pay,allowance,created_at,updated_at FROM paycards WHERE id=?",new String[]{String.valueOf(id)})){if(!c.moveToFirst())return null;JSONObject o=new JSONObject();o.put("id",c.getLong(0));o.put("paydayDate",c.getString(1));o.put("netPay",c.getDouble(2));o.put("allowance",c.getDouble(3));o.put("createdAt",c.getString(4));o.put("updatedAt",c.getString(5));o.put("expenses",queryExpenses(db,id));return o;}}
    private JSONObject freelanceJson(SQLiteDatabase db,long id)throws JSONException{try(Cursor c=db.rawQuery("SELECT id,income_date,project_name,client_name,amount_received,created_at,updated_at FROM freelance_cards WHERE id=?",new String[]{String.valueOf(id)})){if(!c.moveToFirst())return null;JSONObject o=new JSONObject();o.put("id",c.getLong(0));o.put("incomeDate",c.getString(1));o.put("projectName",c.getString(2));o.put("clientName",c.isNull(3)?JSONObject.NULL:c.getString(3));o.put("amountReceived",c.getDouble(4));o.put("createdAt",c.getString(5));o.put("updatedAt",c.getString(6));o.put("expenses",queryFreelanceExpenses(db,id));return o;}}
    private JSONObject receivableJson(SQLiteDatabase db,long id)throws JSONException{try(Cursor c=db.rawQuery("SELECT id,person_name,amount_owed,date_owed,due_date,description,amount_received,created_at,updated_at FROM receivables WHERE id=?",new String[]{String.valueOf(id)})){if(!c.moveToFirst())return null;JSONObject o=new JSONObject();o.put("id",c.getLong(0));o.put("personName",c.getString(1));o.put("amountOwed",c.getDouble(2));o.put("dateOwed",c.getString(3));o.put("dueDate",c.isNull(4)?JSONObject.NULL:c.getString(4));o.put("description",c.isNull(5)?JSONObject.NULL:c.getString(5));o.put("amountReceived",c.getDouble(6));o.put("createdAt",c.getString(7));o.put("updatedAt",c.getString(8));return o;}}
}
