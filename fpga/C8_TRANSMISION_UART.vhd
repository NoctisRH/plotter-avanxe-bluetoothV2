library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;

entity C8_UART_SERIAL is
  generic (CLOCK_HZ : positive := 50000000; BAUD : positive := 115200);
  port(clk : in std_logic; rst : in std_logic; data_in : in std_logic_vector(7 downto 0);
       send : in std_logic; busy : out std_logic; tx : out std_logic);
end C8_UART_SERIAL;
architecture RTL of C8_UART_SERIAL is
  constant TICKS : positive := (CLOCK_HZ + BAUD/2) / BAUD;
  type state_t is (IDLE, START, DATA_BITS, STOP);
  signal state : state_t := IDLE;
  signal timer : integer range 0 to TICKS-1 := 0;
  signal bit_index : integer range 0 to 7 := 0;
  signal shift_reg : std_logic_vector(7 downto 0) := (others => '0');
  signal tx_r : std_logic := '1';
begin
  tx <= tx_r;
  busy <= '0' when state = IDLE else '1';
  process(clk)
  begin
    if rising_edge(clk) then
      if rst = '1' then
        state <= IDLE; timer <= 0; tx_r <= '1'; bit_index <= 0;
      else
        case state is
          when IDLE =>
            tx_r <= '1'; timer <= 0;
            if send = '1' then shift_reg <= data_in; state <= START; end if;
          when START =>
            tx_r <= '0';
            if timer = TICKS-1 then timer <= 0; state <= DATA_BITS;
            else timer <= timer + 1; end if;
          when DATA_BITS =>
            tx_r <= shift_reg(bit_index);
            if timer = TICKS-1 then
              timer <= 0;
              if bit_index = 7 then bit_index <= 0; state <= STOP;
              else bit_index <= bit_index + 1; end if;
            else timer <= timer + 1; end if;
          when STOP =>
            tx_r <= '1';
            if timer = TICKS-1 then timer <= 0; state <= IDLE;
            else timer <= timer + 1; end if;
        end case;
      end if;
    end if;
  end process;
end RTL;

library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;

-- C8_TRANSMISION_UART: envio UART 8N1 y protocolo de respuesta.
-- Respuestas [0x5A][STATUS]. Protocolo stop-and-wait: solo una solicitud pendiente.
entity C8_TRANSMISION_UART is
  generic(CLOCK_HZ : positive := 50000000; BAUD : positive := 115200);
  port(clk : in std_logic; rst : in std_logic;
       response_valid : in std_logic; response_code : in std_logic_vector(7 downto 0);
       tx : out std_logic; response_busy : out std_logic);
end C8_TRANSMISION_UART;
architecture RTL of C8_TRANSMISION_UART is
  type state_t is (WAIT_RESPONSE, SEND_HEADER, WAIT_HEADER_BUSY, WAIT_HEADER_DONE,
                   SEND_CODE, WAIT_CODE_BUSY, WAIT_CODE_DONE);
  signal state : state_t := WAIT_RESPONSE;
  signal tx_data : std_logic_vector(7 downto 0) := (others => '0');
  signal code_latched : std_logic_vector(7 downto 0) := (others => '0');
  signal tx_send, tx_busy : std_logic := '0';
begin
  response_busy <= '0' when state = WAIT_RESPONSE else '1';
  U_TX: entity work.C8_UART_SERIAL
    generic map(CLOCK_HZ=>CLOCK_HZ, BAUD=>BAUD)
    port map(clk=>clk,rst=>rst,data_in=>tx_data,send=>tx_send,busy=>tx_busy,tx=>tx);
  process(clk)
  begin
    if rising_edge(clk) then
      tx_send <= '0';
      if rst = '1' then state <= WAIT_RESPONSE;
      else
        case state is
          when WAIT_RESPONSE =>
            if response_valid = '1' then
              code_latched <= response_code;
              state <= SEND_HEADER;
            end if;
          when SEND_HEADER =>
            if tx_busy = '0' then
              tx_data <= x"5A"; tx_send <= '1'; state <= WAIT_HEADER_BUSY;
            end if;
          when WAIT_HEADER_BUSY =>
            if tx_busy = '1' then state <= WAIT_HEADER_DONE; end if;
          when WAIT_HEADER_DONE =>
            if tx_busy = '0' then state <= SEND_CODE; end if;
          when SEND_CODE =>
            if tx_busy = '0' then
              tx_data <= code_latched; tx_send <= '1'; state <= WAIT_CODE_BUSY;
            end if;
          when WAIT_CODE_BUSY =>
            if tx_busy = '1' then state <= WAIT_CODE_DONE; end if;
          when WAIT_CODE_DONE =>
            if tx_busy = '0' then state <= WAIT_RESPONSE; end if;
        end case;
      end if;
    end if;
  end process;
end RTL;