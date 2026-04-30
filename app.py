import streamlit as st
import sqlite3
import pandas as pd
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import time
import random

# Sätt sidans utseende
st.set_page_config(page_title="SourcingEU CRM", layout="wide")

# Skapa databasanslutning
conn = sqlite3.connect('crm_data.db', check_same_thread=False)
c = conn.cursor()

# Skapa tabeller om de inte finns
c.execute('''CREATE TABLE IF NOT EXISTS contacts 
             (name TEXT, company TEXT, email TEXT, type TEXT, status TEXT, last_contact TEXT)''')
conn.commit()

# Meny i sidofältet
st.sidebar.title("SourcingEU CRM")
menu = ["Kontakter", "Outreach", "Statistik"]
choice = st.sidebar.selectbox("Välj vy", menu)

# --- NY FUNKTION: RADERA ALLT (längst ner i sidomenyn) ---
st.sidebar.markdown("---")
if st.sidebar.button("⚠️ RADERA ALLA KONTAKTER"):
    c.execute("DELETE FROM contacts")
    conn.commit()
    st.sidebar.success("Databasen är rensad!")
    st.rerun()

if choice == "Kontakter":
    st.title("Kontakthantering")
    
    with st.expander("Importera kontakter från CSV-fil"):
        uploaded_file = st.file_uploader("Välj en CSV-fil", type="csv")
        if uploaded_file is not None:
            data = pd.read_csv(uploaded_file)
            st.write("Förhandsgranskning:")
            st.dataframe(data.head(3))
            
            col_name = st.selectbox("Kolumn för NAMN", data.columns)
            col_email = st.selectbox("Kolumn för E-POST", data.columns)
            col_comp = st.selectbox("Kolumn för FÖRETAG", data.columns)
            
            if st.button("Genomför import"):
                for index, row in data.iterrows():
                    c.execute("INSERT INTO contacts VALUES (?,?,?,?,?,?)", 
                              (str(row[col_name]), str(row[col_comp]), str(row[col_email]), "Producent", "Inte kontaktad", "-"))
                conn.commit()
                st.success("Importerat!")
                st.rerun()

    with st.expander("Lägg till ny kontakt manuellt"):
        col_m1, col_m2 = st.columns(2)
        name = col_m1.text_input("Namn")
        comp = col_m2.text_input("Företag")
        email = col_m1.text_input("E-post")
        ctype = col_m2.selectbox("Typ", ["Producent", "Inköpare"])
        if st.button("Spara manuellt"):
            c.execute("INSERT INTO contacts VALUES (?,?,?,?,?,?)", (name, comp, email, ctype, "Inte kontaktad", "-"))
            conn.commit()
            st.success(f"{name} tillagd!")
            st.rerun()

    st.subheader("Din kontaktlista")
    df = pd.read_sql_query("SELECT * FROM contacts", conn)
    st.dataframe(df, use_container_width=True)
    
    csv = df.to_csv(index=False).encode('utf-8')
    st.download_button("Exportera/Backup till CSV", csv, "crm_backup.csv", "text/csv")

elif choice == "Outreach":
    st.title("Skicka Outreach")
    
    df = pd.read_sql_query("SELECT * FROM contacts WHERE status = 'Inte kontaktad'", conn)
    if df.empty:
        st.warning("Inga nya kontakter att mejla. (Använd knappen i sidomenyn om du vill nollställa listan)")
    else:
        selected_emails = st.multiselect("Välj mottagare", df['email'].tolist())
        subject = st.text_input("Ämnesrad")
        message_body = st.text_area("Meddelande (Använd {{namn}} för personifiering)")
        
        if st.button("Starta utskick"):
            try:
                server = smtplib.SMTP(st.secrets["SMTP_HOST"], st.secrets["SMTP_PORT"])
                server.starttls()
                server.login(st.secrets["SMTP_USER"], st.secrets["SMTP_PWD"])
                
                progress_bar = st.progress(0)
                for i, target_email in enumerate(selected_emails):
                    c.execute("SELECT name FROM contacts WHERE email=?", (target_email,))
                    contact_info = c.fetchone()
                    contact_name = contact_info[0] if contact_info else "vän"
                    
                    final_msg = message_body.replace("{{namn}}", str(contact_name))
                    
                    msg = MIMEMultipart()
                    msg['From'] = f"{st.secrets['SENDER_NAME']} <{st.secrets['SENDER_EMAIL']}>"
                    msg['To'] = target_email
                    msg['Subject'] = subject
                    msg.attach(MIMEText(final_msg, 'plain'))

                    server.sendmail(st.secrets["SENDER_EMAIL"], target_email, msg.as_string())
                    
                    c.execute("UPDATE contacts SET status='Mejlad', last_contact=date('now') WHERE email=?", (target_email,))
                    conn.commit()
                    
                    st.write(f"✅ Skickat till {target_email}")
                    time.sleep(random.randint(5, 10)) 
                    progress_bar.progress((i + 1) / len(selected_emails))
                
                server.quit()
                st.success("Alla mejl skickade!")
                st.rerun()
            except Exception as e:
                st.error(f"Fel vid utskick: {e}")

elif choice == "Statistik":
    st.title("Statistik")
    df = pd.read_sql_query("SELECT * FROM contacts", conn)
    if not df.empty:
        st.write(f"Totalt: {len(df)}")
        st.bar_chart(df['status'].value_counts())
