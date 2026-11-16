library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;

-- C1_RECEPCION_UART: receptor UART, 8 bits, sin paridad, un bit de parada (8N1).
-- Todas las transiciones usan clk; no se generan relojes secundarios.
entity C1_RECEPCION_UART is
  generic (CLOCK_HZ : positive := 50000000; BAUD : positive := 115200);
  port (clk : in std_logic; rst : in std_logic; rx : in std_logic;
        data_out : out std_logic_vector(7 downto 0); data_valid : out std_logic);
end C1_RECEPCION_UART;

architecture RTL of C1_RECEPCION_UART is
  constant TICKS : positive := (CLOCK_HZ + BAUD/2) / BAUD;
  type state_t is (ESPERA, INICIO, DATOS, PARADA);
  signal state : state_t := ESPERA;
  signal rx_meta, rx_sync : std_logic := '1';
  signal timer : integer range 0 to TICKS-1 := 0;
  signal bit_index : integer range 0 to 7 := 0;
  signal shift_reg : std_logic_vector(7 downto 0) := (others => '0');
  signal data_reg : std_logic_vector(7 downto 0) := (others => '0');
  signal valid_reg : std_logic := '0';
begin
  data_out <= data_reg;
  data_valid <= valid_reg;
  process(clk)
  begin
    if rising_edge(clk) then
      rx_meta <= rx;
      rx_sync <= rx_meta;
      valid_reg <= '0';
      if rst = '1' then
        state <= ESPERA;
        timer <= 0;
        bit_index <= 0;
        rx_meta <= '1';
        rx_sync <= '1';
      else
        case state is
          when ESPERA =>
            timer <= 0;
            if rx_sync = '0' then state <= INICIO; end if;
          when INICIO =>
            if timer = (TICKS/2)-1 then
              timer <= 0;
              if rx_sync = '0' then state <= DATOS;
              else state <= ESPERA; end if;
            else timer <= timer + 1; end if;
          when DATOS =>
            if timer = TICKS-1 then
              timer <= 0;
              shift_reg(bit_index) <= rx_sync;
              if bit_index = 7 then bit_index <= 0; state <= PARADA;
              else bit_index <= bit_index + 1; end if;
            else timer <= timer + 1; end if;
          when PARADA =>
            if timer = TICKS-1 then
              timer <= 0;
              state <= ESPERA;
              if rx_sync = '1' then
                data_reg <= shift_reg;
                valid_reg <= '1';
              end if;
            else timer <= timer + 1; end if;
        end case;
      end if;
    end if;
  end process;
end RTL;